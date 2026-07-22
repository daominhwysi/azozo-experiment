import argparse
import base64
import os
import random
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional, Dict, Any, Union
from dotenv import load_dotenv
import fitz  # PyMuPDF
from openai import OpenAI
from tqdm import tqdm

# Reconfigure stdout to use UTF-8 encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load environment variables
workspace_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=workspace_dir / ".env")

SYSTEM_PROMPTS = [
    (
        "You are an expert OCR assistant. Perform precise OCR on the provided pages. "
        "Extract all text, headings, and structure. Format your output strictly in Markdown. "
        "For any mathematical formulas, variables, and equations, convert them accurately to standard LaTeX format "
        "(e.g. using $...$ for inline or $$...$$ for block formulas) so they are clean and readable. "
        "Use styling tags when relevant to represent visual indicators: "
        "use <u>...</u> to mark underlined text, <mark>...</mark> to represent highlighted/marked text, "
        "**...** for bold text, and *...* for italicized text. "
        "Separate each page using the delimiter '<|page|>' followed by the page indicator 'Page X'. "
        "For example:\n"
        "<|page|>Content of page 1<|page|>Content of page 2\n\n"
        "Important Layout & Formatting Rules:\n"
        "1. If the input page has multiple columns (e.g. two-column exam layout), you MUST convert and merge them into a single column following the logical reading order. Do NOT attempt to reconstruct columns side-by-side.\n"
        "2. Format the output so it is clean, structured, and easy for readers and students to work with. Do NOT attempt to visually replicate the exact physical spacing or layout of the original document/image if it makes the output look cluttered or hard to read. Prioritize logical flow and standard spacing."
    ),
    (
        "You are an expert OCR assistant. Perform precise OCR on the provided pages. "
        "Extract all text, headings, and structure. Format your output strictly as PLAIN TEXT. "
        "Do not use markdown formatting. For any mathematical formulas, variables, and equations, "
        "convert them accurately to standard LaTeX format (e.g. using $...$ for inline or $$...$$ for block formulas). "
        "Use styling tags when relevant to represent visual indicators: "
        "use <u>...</u> to mark underlined text, <mark>...</mark> to represent highlighted/marked text. "
        "Separate each page using the delimiter '<|page|>' followed by the page indicator 'Page X'. "
        "For example:\n"
        "<|page|>Content of page 1<|page|>Content of page 2\n\n"
        "Important Layout & Formatting Rules:\n"
        "1. If the input page has multiple columns (e.g. two-column exam layout), you MUST convert and merge them into a single column following the logical reading order. Do NOT attempt to reconstruct columns side-by-side.\n"
        "2. Format the output so it is clean, structured, and easy for readers and students to work with. Do NOT attempt to visually replicate the exact physical spacing or layout of the original document/image if it makes the output look cluttered or hard to read. Prioritize logical flow and standard spacing."
    ),
]

SYSTEM_PROMPT_LONG_CONTEXT = (
    "You are an expert Document OCR and Structural Layout Mining Assistant. "
    "Transcribe the provided document page images into formatted Markdown AND emit a compact page boundary JSON header. "
    "Formatting Rules:\n"
    "1. Markdown Output: Extract text, headings, and lists. Merge multi-column layouts into single-column reading order.\n"
    "2. LaTeX Normalization: Convert all math/formulas to standard LaTeX ($...$ inline, $$...$$ block).\n"
    "3. Page Boundary Header: At the end of each page, output a strict JSON block enclosed in <|page_metadata|> ... <|end_metadata|>.\n"
    "Schema: {\"p\": page_num, \"head\": \"CLEAN\"|\"CONT_GROUP\"|\"CONT_THEORY\", \"tail\": \"CLEAN\"|\"OPEN_GROUP\"|\"OPEN_THEORY\"|\"OPEN_STEM\"|\"OPEN_OPT\", \"seq\": [[\"THEORY_START\", title], [\"STIM_START\", id], [\"Q_START\", num], [\"Q_END\", num]]}"
)



def prune_think_tags(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    cleaned = re.sub(r"<think>.*", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()


def load_few_shot_messages(example_dir: Path) -> List[Dict[str, Any]]:
    messages = []
    if not example_dir.exists():
        return messages

    i = 1
    while True:
        in_file = example_dir / f"in_{i}.png"
        out_file = example_dir / f"out_{i}.md"
        if not (in_file.exists() and out_file.exists()):
            break
        try:
            with open(in_file, "rb") as f_in:
                img_base64 = base64.b64encode(f_in.read()).decode("utf-8")
            with open(out_file, "r", encoding="utf-8") as f_out:
                out_content = f_out.read()
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all text from this exam page image."},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_base64}"}},
                ],
            })
            messages.append({"role": "assistant", "content": out_content})
        except Exception as e:
            print(f"  [Warning] Failed to load OCR few-shot pair {i}: {e}")
        i += 1

    if messages:
        print(f"  Loaded {len(messages) // 2} few-shot OCR example pair(s).")
    return messages


class PDFOCRConverter:
    """
    Complete PDF OCR System for Exam Documents.
    Supports Vision LLM (Minimax-M3 / OpenAI vision) with automatic PyMuPDF fallback.
    Processes pages in batches (default: 3 images/batch) with parallel concurrency (default: 5 workers).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: str = "mn/Minimax-M3",
        batch_size: int = 3,
        concurrency: int = 5,
        examples_dir: Optional[Union[str, Path]] = None,
    ):
        if base_url is None or base_url == "https://api.vilao.ai/v1":
            if model.startswith("phatchau036/") or model.startswith("mainnewnol/") or "xah" in model.lower():
                self.base_url = "https://api.xah.io/v1"
                self.api_key = api_key or os.environ.get("XAH_API_KEY") or os.environ.get("LLM_API_KEY")
            else:
                self.base_url = "https://api.vilao.ai/v1"
                self.api_key = api_key or os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
        else:
            self.base_url = base_url
            self.api_key = api_key or os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")

        self.model = model
        self.batch_size = batch_size
        self.concurrency = concurrency
        self.client = None
        if self.api_key:
            self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

        # Load few-shot examples
        script_dir = Path(__file__).resolve().parent
        ocr_examples_dir = Path(examples_dir) if examples_dir else script_dir / "examples" / "ocr"
        self.few_shot_messages = load_few_shot_messages(ocr_examples_dir)

    def extract_text_pymupdf_fallback(self, doc: fitz.Document, start_idx: int, end_idx: int) -> str:
        """Fallback local text extraction using PyMuPDF if API is unavailable or fails."""
        page_texts = []
        for idx in range(start_idx, end_idx):
            page_num = idx + 1
            page = doc[idx]
            text = page.get_text("text")
            page_texts.append(f"<|page|>Page {page_num}\n\n{text.strip()}")
        return "\n\n".join(page_texts)

    def convert_pdf(
        self,
        pdf_path: Union[str, Path],
        output_path: Optional[Union[str, Path]] = None,
        dpi: int = 150,
        batch_size: Optional[int] = None,
        concurrency: Optional[int] = None,
        use_fallback: bool = True,
        progress_callback: Optional[Any] = None,
    ) -> str:
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        effective_batch_size = batch_size if batch_size is not None else self.batch_size
        effective_concurrency = concurrency if concurrency is not None else self.concurrency

        try:
            doc = fitz.open(str(pdf_path))
        except Exception as e:
            raise RuntimeError(f"Failed to open PDF file '{pdf_path}': {e}")

        total_pages = len(doc)
        print(f"Opening PDF '{pdf_path.name}' ({total_pages} page(s))...")
        print(f"  [OCR Settings] Batch Size: {effective_batch_size} image(s)/batch, Concurrency: {effective_concurrency} parallel worker(s)")

        if progress_callback:
            progress_callback(0, total_pages, f"Đang render {total_pages} trang PDF...")

        # Render all page images upfront into base64 and extract raw text for fallback
        page_images: List[str] = []
        page_fallback_texts: List[str] = []
        for idx in range(total_pages):
            page = doc[idx]
            pix = page.get_pixmap(dpi=dpi)
            img_bytes = pix.tobytes("jpeg")
            page_images.append(base64.b64encode(img_bytes).decode("utf-8"))
            page_fallback_texts.append(page.get_text("text").strip())
        doc.close()

        # Prepare batches (each batch contains up to `effective_batch_size` images)
        batches = []
        batch_id = 0
        for start_idx in range(0, total_pages, effective_batch_size):
            end_idx = min(start_idx + effective_batch_size, total_pages)
            batches.append((batch_id, start_idx, end_idx))
            batch_id += 1

        def process_single_batch(batch_info: tuple) -> tuple[int, str]:
            b_id, s_idx, e_idx = batch_info
            print(f"  [OCR Batch {b_id + 1}/{len(batches)}] Processing pages {s_idx + 1} to {e_idx}...")

            if self.client is not None:
                try:
                    system_prompt = random.choice(SYSTEM_PROMPTS)
                    content_parts = [{"type": "text", "text": system_prompt}]

                    for idx in range(s_idx, e_idx):
                        page_num = idx + 1
                        content_parts.append(
                            {"type": "text", "text": f"--- Document Page {page_num} ---"}
                        )
                        content_parts.append(
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{page_images[idx]}"},
                            }
                        )

                    messages = self.few_shot_messages + [{"role": "user", "content": content_parts}]
                    response = self.client.chat.completions.create(
                        model=self.model,
                        messages=messages,
                    )
                    raw_result = response.choices[0].message.content
                    batch_result = prune_think_tags(raw_result)
                    return (b_id, batch_result)

                except Exception as e:
                    print(f"  [Warning] Vision LLM API failed for batch {b_id + 1} (pages {s_idx + 1}-{e_idx}): {e}")
                    if not use_fallback:
                        raise e

            # Fallback text extraction if API is disabled or fails
            print(f"  [Fallback] Extracting PyMuPDF text for batch {b_id + 1} (pages {s_idx + 1}-{e_idx})...")
            fallback_parts = []
            for idx in range(s_idx, e_idx):
                fallback_parts.append(f"<|page|>Page {idx + 1}\n\n{page_fallback_texts[idx]}")
            return (b_id, "\n\n".join(fallback_parts))

        # Run batches concurrently using ThreadPoolExecutor with tqdm progress bar
        results = [None] * len(batches)
        if batches:
            max_workers = min(effective_concurrency, len(batches))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_batch = {executor.submit(process_single_batch, b): b for b in batches}
                pbar = tqdm(
                    as_completed(future_to_batch),
                    total=len(batches),
                    desc="[OCR Batches]",
                    unit="batch"
                )
                completed_batches = 0
                for future in pbar:
                    b_id, batch_text = future.result()
                    results[b_id] = batch_text
                    completed_batches += 1
                    if progress_callback:
                        completed_pages = min(total_pages, completed_batches * effective_batch_size)
                        progress_callback(
                            completed_pages,
                            total_pages,
                            f"Đang bóc tách OCR trang {completed_pages}/{total_pages}..."
                        )

        final_text = "\n\n".join(filter(None, results)).strip()

        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(final_text)
            print(f"OCR output saved to: {output_path}")

        return final_text

    def convert_directory(
        self,
        input_dir: Union[str, Path],
        output_dir: Union[str, Path],
        limit: Optional[int] = None,
        force: bool = False,
    ) -> List[Path]:
        input_dir = Path(input_dir)
        output_dir = Path(output_dir)

        if not input_dir.exists():
            raise FileNotFoundError(f"Input directory does not exist: {input_dir}")

        pdf_files = list(input_dir.rglob("*.pdf"))
        if not pdf_files:
            print(f"No PDF files found recursively in '{input_dir}'.")
            return []

        if limit is not None:
            pdf_files = pdf_files[:limit]

        output_paths = []
        for pdf_path in tqdm(pdf_files, desc="[OCR Files]", unit="file"):
            rel_path = pdf_path.relative_to(input_dir)
            out_rel_path = rel_path.with_suffix(".md")
            output_file_path = output_dir / out_rel_path

            if output_file_path.exists() and not force:
                print(f"Skipping existing output: {output_file_path}")
                output_paths.append(output_file_path)
                continue

            print(f"\nProcessing PDF: {pdf_path}")
            self.convert_pdf(pdf_path, output_path=output_file_path)
            output_paths.append(output_file_path)

        return output_paths



def main():
    parser = argparse.ArgumentParser(
        description="Recursively perform OCR on PDF exam files using Vision LLM / PyMuPDF fallback."
    )
    parser.add_argument(
        "--input", "-i", default="input", help="Input directory or single PDF file"
    )
    parser.add_argument(
        "--output", "-o", default="out", help="Output directory to save markdown OCR files"
    )
    parser.add_argument(
        "--limit", "-l", type=int, default=None, help="Limit number of PDF files to process"
    )
    parser.add_argument(
        "--test", "-t", action="store_true", help="Test mode (processes 1 PDF file)"
    )
    parser.add_argument(
        "--force", "-f", action="store_true", help="Force reprocessing even if output exists"
    )
    parser.add_argument(
        "--model", default="mn/Minimax-M3", help="Vision LLM model identifier"
    )
    parser.add_argument(
        "--batch-size", type=int, default=3, help="Number of images per OCR batch request (default: 3)"
    )
    parser.add_argument(
        "--concurrency", type=int, default=5, help="Number of parallel OCR batch requests (default: 5)"
    )

    args = parser.parse_args()
    limit = 1 if args.test else args.limit

    converter = PDFOCRConverter(
        model=args.model,
        batch_size=args.batch_size,
        concurrency=args.concurrency
    )

    inp = Path(args.input)
    if inp.is_file() and inp.suffix.lower() == ".pdf":
        out = Path(args.output)
        if out.is_dir() or not out.suffix:
            out = out / f"{inp.stem}.md"
        converter.convert_pdf(inp, output_path=out)
    else:
        converter.convert_directory(args.input, args.output, limit=limit, force=args.force)


if __name__ == "__main__":
    main()

