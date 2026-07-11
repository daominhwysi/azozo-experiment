import time
import uuid
import json
import asyncio
import string
import random
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from backend.app.config import TMP_DIR, OCR_MODEL, OCR_BATCH_SIZE, OCR_CONCURRENCY, PARSER_MODEL
from backend.app.services.parser import parse_spans_into_structured_questions, regex_parse_questions
from backend.app.services.ocr_logger import log_ocr_annotate_request
from backend.real_data_annotator.pdf_converter import PDFOCRConverter
from backend.real_data_annotator.annotate_ocr import OCRAnnotator

router = APIRouter(prefix="/api", tags=["ocr"])

# Global dictionary to track OCR task statuses
ocr_tasks = {}

def generate_task_id():
    return "task_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))


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
        annotation_res = annotator.annotate_text(ocr_text)

        structured_questions, stimuli = parse_spans_into_structured_questions(
            annotation_res["raw_text"], annotation_res["spans"]
        )
        raw_xml = annotation_res.get("raw_xml", "")
        spans_count = len(annotation_res.get("spans", []))
        tokens_count = len(annotation_res.get("tokens", []))
    except Exception as e:
        print(f"[Fallback Parser] LLM annotation unavailable/failed ({e}), using regex parser.")
        structured_questions = regex_parse_questions(ocr_text)
        stimuli = {}

    if not structured_questions:
        structured_questions = regex_parse_questions(ocr_text)
        stimuli = {}

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
        "stimuli": stimuli,
        "log_folder": log_folder.name,
    }


@router.post("/parse-exam-stream")
async def parse_exam_from_pdf_or_text_stream(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
):
    """
    Azota OCR & Exam Importer API with real-time SSE streaming.
    Streams 2 main stages:
      1. OCR (PyMuPDF layout & text extraction)
      2. Annotate (Token streaming sequence labeling & question structuring)
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
        original_input_tokens = max(30, int(words_count * 1.3))
        estimated_tokens = int(original_input_tokens * 1.8)

        yield f"data: {json.dumps({'type': 'ocr_complete', 'step': 1, 'step_name': 'OCR', 'progress': 50, 'raw_text_length': len(ocr_text), 'estimated_tokens': estimated_tokens, 'message': f'Hoàn tất OCR ({len(ocr_text)} ký tự, ~{estimated_tokens} tokens dự kiến)'}, ensure_ascii=False)}\n\n"

        # --- STAGE 2: ANNOTATE ---
        yield f"data: {json.dumps({'type': 'annotate_start', 'step': 2, 'step_name': 'Annotate', 'progress': 50, 'streamed_tokens': 0, 'estimated_tokens': estimated_tokens, 'message': 'Bắt đầu gán nhãn LLM (Full Text)...'}, ensure_ascii=False)}\n\n"

        annotation_res = None
        structured_questions = []
        stimuli = {}
        queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def token_callback(streamed, estimated, chunk):
            loop.call_soon_threadsafe(queue.put_nowait, (streamed, estimated, chunk))

        annotation_error = None

        def run_annotation():
            nonlocal annotation_res, structured_questions, annotation_error, stimuli
            try:
                annotator = OCRAnnotator(model=PARSER_MODEL)
                annotation_res = annotator.annotate_text_stream(ocr_text, callback=token_callback)
                structured_questions, stimuli = parse_spans_into_structured_questions(
                    annotation_res["raw_text"], annotation_res["spans"]
                )
            except Exception as e:
                import traceback
                annotation_error = str(e)
                print(f"[Fallback Parser in Stream] LLM annotation failed ({e}), using regex parser.")
                traceback.print_exc()
                structured_questions = regex_parse_questions(ocr_text)
                stimuli = {}
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
            stimuli = {}

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
                "stimuli": stimuli,
                "log_folder": log_folder.name,
            }
        }
        yield f"data: {json.dumps(final_payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def run_ocr_task_bg(
    task_id: str,
    temp_pdf_path_str: Optional[str],
    raw_text: Optional[str],
    add_to_bank: bool,
    title: str,
    subject: str,
    grade: str,
    duration_minutes: int,
):
    import time
    from backend.app.database import load_db, save_db
    from backend.real_data_annotator.pdf_converter import PDFOCRConverter
    from backend.real_data_annotator.annotate_ocr import OCRAnnotator
    from backend.app.services.parser import parse_spans_into_structured_questions, regex_parse_questions
    from backend.app.config import OCR_MODEL, OCR_BATCH_SIZE, OCR_CONCURRENCY, PARSER_MODEL
    from backend.app.services.ocr_logger import log_ocr_annotate_request
    from pathlib import Path
    import uuid

    start_time = time.time()
    start_time = time.time()
    
    # Initialize task entry safely if missing (e.g. server reloaded)
    if task_id not in ocr_tasks:
        from pathlib import Path
        filename = Path(temp_pdf_path_str).name if temp_pdf_path_str else "Văn bản thô"
        ocr_tasks[task_id] = {
            "id": task_id,
            "status": "processing",
            "progress": 0,
            "message": "Khởi tạo tiến trình...",
            "filename": filename,
            "add_to_bank": add_to_bank,
            "title": title,
            "subject": subject,
            "grade": grade,
            "duration_minutes": duration_minutes,
            "created_at": datetime.now().isoformat(),
        }
    else:
        ocr_tasks[task_id]["status"] = "processing"
        ocr_tasks[task_id]["progress"] = 0
        ocr_tasks[task_id]["message"] = "Khởi tạo tiến trình..."

    ocr_text = ""
    file_bytes = None
    file_name = ocr_tasks[task_id].get("filename")

    def update_task(progress=None, message=None, status=None, error=None, added_to_bank_id=None, completed_at=None, result=None):
        if task_id in ocr_tasks:
            if progress is not None:
                ocr_tasks[task_id]["progress"] = progress
            if message is not None:
                ocr_tasks[task_id]["message"] = message
            if status is not None:
                ocr_tasks[task_id]["status"] = status
            if error is not None:
                ocr_tasks[task_id]["error"] = error
            if added_to_bank_id is not None:
                ocr_tasks[task_id]["added_to_bank_id"] = added_to_bank_id
            if completed_at is not None:
                ocr_tasks[task_id]["completed_at"] = completed_at
            if result is not None:
                ocr_tasks[task_id]["result"] = result

    def bg_ocr_progress_callback(completed, total, msg):
        calc_prog = int((completed / max(1, total)) * 50)
        update_task(progress=calc_prog, message=f"OCR: {msg}")

    def bg_token_callback(streamed, estimated, chunk):
        calc_prog = min(99, 50 + int((streamed / max(1, estimated)) * 50))
        update_task(progress=calc_prog, message=f"Gán nhãn LLM: {streamed}/{estimated} tokens...")

    try:
        if temp_pdf_path_str:
            temp_pdf_path = Path(temp_pdf_path_str)
            if temp_pdf_path.exists():
                with open(temp_pdf_path, "rb") as f:
                    file_bytes = f.read()

                converter = PDFOCRConverter(
                    model=OCR_MODEL,
                    batch_size=OCR_BATCH_SIZE,
                    concurrency=OCR_CONCURRENCY,
                )
                ocr_text = converter.convert_pdf(temp_pdf_path, progress_callback=bg_ocr_progress_callback)
        elif raw_text:
            ocr_text = raw_text
            update_task(progress=50)

        update_task(progress=50, message="Bắt đầu gán nhãn LLM...")

        annotator = OCRAnnotator(model=PARSER_MODEL)
        try:
            annotation_res = annotator.annotate_text_stream(ocr_text, callback=bg_token_callback)
            structured_questions, stimuli = parse_spans_into_structured_questions(
                annotation_res["raw_text"], annotation_res["spans"]
            )
            raw_xml = annotation_res.get("raw_xml", "")
            spans_count = len(annotation_res.get("spans", []))
            tokens_count = len(annotation_res.get("tokens", []))
        except Exception as e:
            print(f"[Fallback Parser in BG] LLM annotation failed ({e}), using regex parser.")
            structured_questions = regex_parse_questions(ocr_text)
            stimuli = {}
            annotation_res = None
            raw_xml = ""
            spans_count = 0
            tokens_count = 0

        if not structured_questions:
            structured_questions = regex_parse_questions(ocr_text)
            stimuli = {}

        duration = time.time() - start_time

        update_task(progress=80, message="Đang ghi nhật ký...")

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
            source="background_task",
        )

        result_payload = {
            "success": True,
            "filename": file_name,
            "raw_text": ocr_text,
            "raw_xml": raw_xml,
            "spans_count": spans_count,
            "tokens_count": tokens_count,
            "questions": structured_questions,
            "stimuli": stimuli,
            "log_folder": log_folder.name if log_folder else None,
        }

        if add_to_bank and structured_questions:
            update_task(message="Đang tự động lưu đề thi vào ngân hàng...")
            db = load_db()
            exam_id = f"exam_{uuid.uuid4().hex[:8]}"
            new_exam = {
                "id": exam_id,
                "title": title,
                "subject": subject,
                "grade": grade,
                "duration_minutes": duration_minutes,
                "created_at": datetime.now().isoformat(),
                "questions": structured_questions,
            }
            db["exams"].insert(0, new_exam)
            save_db(db)
            update_task(added_to_bank_id=exam_id)

        update_task(status="completed", progress=100, message="Hoàn thành!", completed_at=datetime.now().isoformat(), result=result_payload)

    except Exception as ex:
        import traceback
        traceback.print_exc()
        update_task(status="failed", error=str(ex), message=f"Lỗi: {str(ex)}")
    finally:
        if temp_pdf_path_str:
            p = Path(temp_pdf_path_str)
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass


@router.post("/ocr-tasks")
async def create_ocr_task(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    add_to_bank: bool = Form(False),
    title: str = Form("Đề Thi Mới"),
    subject: str = Form("Toán Học"),
    grade: str = Form("Lớp 12"),
    duration_minutes: int = Form(45),
):
    if not file and not raw_text:
        raise HTTPException(status_code=400, detail="Must provide either PDF file or raw_text")

    task_id = generate_task_id()
    temp_pdf_path_str = None
    filename = None

    if file and file.filename.lower().endswith(".pdf"):
        filename = file.filename
        temp_pdf_path = TMP_DIR / f"upload_{uuid.uuid4().hex[:8]}.pdf"
        temp_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        file_bytes = await file.read()
        with open(temp_pdf_path, "wb") as f:
            f.write(file_bytes)
        temp_pdf_path_str = str(temp_pdf_path)

    ocr_tasks[task_id] = {
        "id": task_id,
        "status": "pending",
        "progress": 0,
        "message": "Đang chờ xử lý...",
        "filename": filename,
        "add_to_bank": add_to_bank,
        "title": title,
        "subject": subject,
        "grade": grade,
        "duration_minutes": duration_minutes,
        "created_at": datetime.now().isoformat(),
    }

    background_tasks.add_task(
        run_ocr_task_bg,
        task_id,
        temp_pdf_path_str,
        raw_text,
        add_to_bank,
        title,
        subject,
        grade,
        duration_minutes,
    )

    return {"task_id": task_id, "status": "pending"}


@router.get("/ocr-tasks")
def list_ocr_tasks():
    sorted_tasks = sorted(ocr_tasks.values(), key=lambda x: x.get("created_at", ""), reverse=True)
    return sorted_tasks


@router.get("/ocr-tasks/{task_id}")
def get_ocr_task(task_id: str):
    if task_id not in ocr_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return ocr_tasks[task_id]


@router.delete("/ocr-tasks/{task_id}")
def delete_ocr_task(task_id: str):
    if task_id not in ocr_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    del ocr_tasks[task_id]
    return {"success": True}


