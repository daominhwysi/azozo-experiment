import time
import uuid
import re
from typing import List, Dict, Any, Optional
from backend.real_data_annotator.pdf_converter import PDFOCRConverter
from backend.app.services.long_parser.sequence_reconciler import DocumentStateStack, extract_metadata_headers_from_markdown
from backend.app.services.long_parser.greedy_chunker import greedy_oversize_chunker
from backend.app.services.long_parser.parser_agent_worker import ParserAgentWorker
from backend.app.services.long_parser.linking_agent import CompactGraphResolverAgent

class LongContextParserPipeline:
    """
    Complete Pipeline Orchestrator for Long-Context Document Parsing (Azozo Engine v2.0).
    Orchestrates OCR -> State Machine Reconstruction -> Passage-Locked Chunking -> Parser Swarm -> Patch Graph Linker.
    """
    def __init__(
        self,
        ocr_model: str = "mn/Minimax-M3",
        parser_model: str = "deepseek-chat",
        linker_model: str = "deepseek-v4-pro",
        parser_provider: Optional[str] = None,
        batch_size: int = 3,
        concurrency: int = 5,
    ):
        self.ocr_model = ocr_model
        self.parser_model = parser_model
        self.linker_model = linker_model
        self.parser_provider = parser_provider
        self.batch_size = batch_size
        self.concurrency = concurrency

    def parse_pdf_long_context(
        self,
        pdf_path: str,
        doc_id: Optional[str] = None,
        progress_callback: Optional[Any] = None
    ) -> Dict[str, Any]:
        start_time = time.time()
        doc_id = doc_id or f"doc_{uuid.uuid4().hex[:8]}"

        # --- Phase 1: Parallel Vision LLM OCR & Metadata Mining ---
        if progress_callback:
            progress_callback(5, 100, "Đang chạy Vision OCR & khai thác Metadata trang...")

        converter = PDFOCRConverter(
            model=self.ocr_model,
            batch_size=self.batch_size,
            concurrency=self.concurrency
        )

        def ocr_callback(completed, total, msg):
            if progress_callback:
                prog = 5 + int((completed / max(1, total)) * 35)
                progress_callback(prog, 100, f"OCR (Minimax-M3): {msg}")

        full_ocr_markdown = converter.convert_pdf(pdf_path, progress_callback=ocr_callback)

        # --- Phase 2: Sequence Reconstruction & State Stack Machine ---
        if progress_callback:
            progress_callback(42, 100, "Xây dựng sơ đồ cấu trúc trang (DocumentStateStack)...")

        metadata_headers = extract_metadata_headers_from_markdown(full_ocr_markdown)
        state_stack = DocumentStateStack(doc_id=doc_id)
        completed_groups = state_stack.process_metadata_stream(metadata_headers)

        # Split full markdown into page dictionaries
        raw_pages = full_ocr_markdown.split("<|page|>")
        page_list = []
        for idx, p_text in enumerate(raw_pages):
            if not p_text.strip():
                continue
            meta = metadata_headers[idx] if idx < len(metadata_headers) else {}
            page_list.append({
                "p": meta.get("p", idx + 1),
                "text": f"<|page|>{p_text}",
                "estimated_tokens": max(50, len(p_text.split())),
                "head": meta.get("head", "CLEAN"),
                "tail": meta.get("tail", "CLEAN")
            })

        # --- Phase 3: Passage-Locked Chunk Partitioning ---
        if progress_callback:
            progress_callback(48, 100, "Phân chia Chunk không cắt đoạn văn (Greedy Chunker)...")

        chunks = greedy_oversize_chunker(page_list, target_tokens=20000, max_tokens=35000)

        # --- Phase 4: Parallel Sequence Extraction (Parser Swarm) ---
        if progress_callback:
            progress_callback(52, 100, f"Đang chạy Parser Agent Swarm ({len(chunks)} Chunks)...")

        worker = ParserAgentWorker(model=self.parser_model, provider=self.parser_provider)
        all_questions = []
        all_stimuli = {}

        for chunk_idx, chunk_pages in enumerate(chunks):
            chunk_text = "\n\n".join(p["text"] for p in chunk_pages)
            res = worker.process_chunk(chunk_text, chunk_index=chunk_idx)
            all_questions.extend(res.get("questions", []))
            all_stimuli.update(res.get("stimuli", {}))

            if progress_callback:
                prog = 52 + int(((chunk_idx + 1) / max(1, len(chunks))) * 33)
                progress_callback(prog, 100, f"Parser Worker: Đã bóc tách Chunk {chunk_idx + 1}/{len(chunks)}...")

        # --- Phase 5: Patch-Based Graph Resolver (Linker Agent) ---
        if progress_callback:
            progress_callback(86, 100, "Đang liên kết đồ thị ngữ cảnh & đáp án (Graph Resolver Agent)...")

        linker = CompactGraphResolverAgent(model=self.linker_model, provider=self.parser_provider)
        final_questions, final_stimuli = linker.resolve_and_apply_patches(
            questions=all_questions,
            stimuli=all_stimuli
        )

        duration = time.time() - start_time
        if progress_callback:
            progress_callback(100, 100, f"Hoàn tất xử lý Long-Context ({len(final_questions)} câu hỏi, {duration:.1f}s)!")

        return {
            "success": True,
            "doc_id": doc_id,
            "total_chunks": len(chunks),
            "questions_count": len(final_questions),
            "stimuli_count": len(final_stimuli),
            "questions": final_questions,
            "stimuli": final_stimuli,
            "duration": duration,
            "raw_text": full_ocr_markdown
        }
