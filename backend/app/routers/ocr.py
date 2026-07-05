import time
import uuid
import json
import asyncio
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from backend.app.config import TMP_DIR, OCR_MODEL, OCR_BATCH_SIZE, OCR_CONCURRENCY, PARSER_MODEL
from backend.app.services.parser import parse_spans_into_structured_questions, regex_parse_questions
from backend.app.services.ocr_logger import log_ocr_annotate_request
from backend.real_data_annotator.pdf_converter import PDFOCRConverter
from backend.real_data_annotator.annotate_ocr import OCRAnnotator

router = APIRouter(prefix="/api", tags=["ocr"])

@router.post("/parse-exam")
async def parse_exam_from_pdf_or_text(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None)
):
    """
    Azota-grade OCR & Exam Importer API.
    Uploads PDF or raw text -> runs PDFOCRConverter & OCRAnnotator -> returns structured questions.
    Logs every request (input, OCR output, annotation, metadata) into a dedicated folder.
    """
    start_time = time.time()
    ocr_text = ""
    file_name = None
    file_bytes = None

    if file and file.filename.lower().endswith(".pdf"):
        file_name = file.filename
        temp_pdf_path = TMP_DIR / f"upload_{uuid.uuid4().hex[:8]}.pdf"
        temp_pdf_path.parent.mkdir(parents=True, exist_ok=True)

        file_bytes = await file.read()
        with open(temp_pdf_path, "wb") as f:
            f.write(file_bytes)

        try:
            converter = PDFOCRConverter(
                model=OCR_MODEL,
                batch_size=OCR_BATCH_SIZE,
                concurrency=OCR_CONCURRENCY,
            )
            ocr_text = converter.convert_pdf(temp_pdf_path)
        finally:
            if temp_pdf_path.exists():
                temp_pdf_path.unlink()

    elif raw_text:
        ocr_text = raw_text
    else:
        log_ocr_annotate_request(
            file_name=file.filename if file else None,
            raw_text_input=raw_text,
            duration=time.time() - start_time,
            status="failed",
            error_message="Must provide either PDF file or raw_text",
            source="api",
        )
        raise HTTPException(status_code=400, detail="Must provide either PDF file or raw_text")

    structured_questions = []
    raw_xml = ""
    spans_count = 0
    tokens_count = 0
    annotation_res = None

    try:
        annotator = OCRAnnotator(model=PARSER_MODEL)
        try:
            annotation_res = annotator.annotate_text(ocr_text)
        except Exception as err:
            print(f"[Anchor Fallback] Full text tagging failed ({err}), trying anchor parser.")
            annotation_res = annotator.annotate_text_anchor(ocr_text)

        structured_questions = parse_spans_into_structured_questions(
            annotation_res["raw_text"], annotation_res["spans"]
        )
        raw_xml = annotation_res.get("raw_xml", "")
        spans_count = len(annotation_res.get("spans", []))
        tokens_count = len(annotation_res.get("tokens", []))
    except Exception as e:
        print(f"[Fallback Parser] LLM annotation unavailable/failed ({e}), using regex parser.")
        structured_questions = regex_parse_questions(ocr_text)

    if not structured_questions:
        structured_questions = regex_parse_questions(ocr_text)

    duration = time.time() - start_time

    # Log every OCR/annotate request to a dedicated folder
    log_folder = log_ocr_annotate_request(
        file_bytes=file_bytes,
        file_name=file_name,
        raw_text_input=raw_text,
        ocr_text=ocr_text,
        annotation_res=annotation_res,
        questions=structured_questions,
        duration=duration,
        status="success",
        ocr_model=OCR_MODEL,
        annotator_model=PARSER_MODEL,
        source="api",
    )

    return {
        "success": True,
        "filename": file_name,
        "raw_text": ocr_text,
        "raw_xml": raw_xml,
        "spans_count": spans_count,
        "tokens_count": tokens_count,
        "questions": structured_questions,
        "log_folder": log_folder.name,
    }


@router.post("/parse-exam-stream")
async def parse_exam_from_pdf_or_text_stream(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    mode: Optional[str] = Form("anchor")
):
    """
    Azota OCR & Exam Importer API with real-time SSE streaming.
    Streams 2 main stages:
      1. OCR (PyMuPDF layout & text extraction)
      2. Annotate (Token streaming sequence labeling & question structuring)
    Supports mode="anchor" (Fast Anchor Shortcut method) or mode="full" (Full text tagging).
    """
    start_time = time.time()
    file_bytes = None
    file_name = file.filename if file else None

    if file:
        file_bytes = await file.read()

    async def event_generator():
        nonlocal start_time
        ocr_text = ""

        # --- STAGE 1: OCR ---
        yield f"data: {json.dumps({'type': 'ocr_start', 'step': 1, 'step_name': 'OCR', 'progress': 10, 'message': 'Đang bóc tách văn bản OCR từ PDF...'}, ensure_ascii=False)}\n\n"

        queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def ocr_progress_callback(completed, total, msg):
            calc_prog = 10 + int((completed / max(1, total)) * 39)
            loop.call_soon_threadsafe(queue.put_nowait, ("ocr_progress", calc_prog, msg))

        if file and file_name and file_name.lower().endswith(".pdf"):
            temp_pdf_path = TMP_DIR / f"upload_{uuid.uuid4().hex[:8]}.pdf"
            temp_pdf_path.parent.mkdir(parents=True, exist_ok=True)
            with open(temp_pdf_path, "wb") as f:
                f.write(file_bytes)

            def run_pdf_ocr():
                nonlocal ocr_text
                try:
                    converter = PDFOCRConverter(
                        model=OCR_MODEL,
                        batch_size=OCR_BATCH_SIZE,
                        concurrency=OCR_CONCURRENCY,
                    )
                    ocr_text = converter.convert_pdf(temp_pdf_path, progress_callback=ocr_progress_callback)
                finally:
                    if temp_pdf_path.exists():
                        temp_pdf_path.unlink()
                    loop.call_soon_threadsafe(queue.put_nowait, None)

            ocr_task = loop.run_in_executor(None, run_pdf_ocr)
            while True:
                item = await queue.get()
                if item is None:
                    break
                kind, prog, msg = item
                yield f"data: {json.dumps({'type': 'ocr_progress', 'step': 1, 'step_name': 'OCR', 'progress': prog, 'message': msg}, ensure_ascii=False)}\n\n"
            await ocr_task
        elif raw_text:
            ocr_text = raw_text
        else:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Must provide either PDF file or raw_text'}, ensure_ascii=False)}\n\n"
            return

        words_count = len(ocr_text.split())
        estimated_tokens = max(40, int(words_count * (0.35 if mode == "anchor" else 1.3)) + 20)

        yield f"data: {json.dumps({'type': 'ocr_complete', 'step': 1, 'step_name': 'OCR', 'progress': 50, 'raw_text_length': len(ocr_text), 'estimated_tokens': estimated_tokens, 'message': f'Hoàn tất OCR ({len(ocr_text)} ký tự, ~{estimated_tokens} tokens dự kiến)'}, ensure_ascii=False)}\n\n"

        # --- STAGE 2: ANNOTATE ---
        mode_label = "Anchor Shortcut" if mode == "anchor" else "Full Text"
        yield f"data: {json.dumps({'type': 'annotate_start', 'step': 2, 'step_name': 'Annotate', 'progress': 50, 'streamed_tokens': 0, 'estimated_tokens': estimated_tokens, 'message': f'Bắt đầu gán nhãn LLM ({mode_label})...'}, ensure_ascii=False)}\n\n"

        annotation_res = None
        structured_questions = []
        queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def token_callback(streamed, estimated, chunk):
            loop.call_soon_threadsafe(queue.put_nowait, (streamed, estimated, chunk))

        def run_annotation():
            nonlocal annotation_res, structured_questions
            try:
                annotator = OCRAnnotator(model=PARSER_MODEL)
                if mode == "anchor":
                    annotation_res = annotator.annotate_text_anchor(ocr_text, callback=token_callback)
                else:
                    annotation_res = annotator.annotate_text_stream(ocr_text, callback=token_callback)
                structured_questions = parse_spans_into_structured_questions(
                    annotation_res["raw_text"], annotation_res["spans"]
                )
            except Exception as e:
                print(f"[Fallback Parser in Stream] LLM annotation failed ({e}), using regex parser.")
                structured_questions = regex_parse_questions(ocr_text)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        annotation_task = loop.run_in_executor(None, run_annotation)

        last_yield_time = time.time()
        while True:
            item = await queue.get()
            if item is None:
                break
            streamed, estimated, chunk = item
            now = time.time()
            if now - last_yield_time >= 0.08 or streamed >= estimated:
                last_yield_time = now
                calc_prog = min(99, 50 + int((streamed / max(1, estimated)) * 49))
                msg = f"Đang gán nhãn LLM ({streamed}/{estimated} tokens)..."
                yield f"data: {json.dumps({'type': 'annotate_progress', 'step': 2, 'step_name': 'Annotate', 'progress': calc_prog, 'streamed_tokens': streamed, 'estimated_tokens': estimated, 'message': msg}, ensure_ascii=False)}\n\n"

        await annotation_task

        if not structured_questions:
            structured_questions = regex_parse_questions(ocr_text)

        duration = time.time() - start_time
        spans_count = len(annotation_res.get("spans", [])) if annotation_res else 0
        tokens_count = len(annotation_res.get("tokens", [])) if annotation_res else 0

        log_folder = log_ocr_annotate_request(
            file_bytes=file_bytes,
            file_name=file_name,
            raw_text_input=raw_text,
            ocr_text=ocr_text,
            annotation_res=annotation_res,
            questions=structured_questions,
            duration=duration,
            status="success",
            ocr_model=OCR_MODEL,
            annotator_model=PARSER_MODEL,
            source="api_stream",
        )

        final_payload = {
            "type": "complete",
            "step": 2,
            "step_name": "Annotate",
            "progress": 100,
            "message": "Trích xuất & gán nhãn hoàn tất!",
            "result": {
                "success": True,
                "filename": file_name,
                "raw_text": ocr_text,
                "raw_xml": annotation_res.get("raw_xml", "") if annotation_res else "",
                "spans_count": spans_count,
                "tokens_count": tokens_count,
                "questions": structured_questions,
                "log_folder": log_folder.name,
            }
        }
        yield f"data: {json.dumps(final_payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

