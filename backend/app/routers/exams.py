import uuid
import json
from pathlib import Path
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from backend.app.models import CreateExamRequest, StudentSubmissionRequest
from backend.app.database import load_db, save_db
from backend.app.services.deepseek_client import chat
from backend.real_data_annotator.pdf_converter import PDFOCRConverter
from backend.app.config import TMP_DIR, OCR_MODEL, OCR_BATCH_SIZE, OCR_CONCURRENCY, ANSWER_MAPPER_MODEL, ANSWER_MAPPER_PROVIDER

router = APIRouter(prefix="/api/exams", tags=["exams"])

@router.get("")
def get_exams():
    db = load_db()
    return db.get("exams", [])

@router.get("/submissions")
def get_submissions(exam_id: Optional[str] = None):
    db = load_db()
    submissions = db.get("submissions", [])
    if exam_id:
        submissions = [s for s in submissions if s.get("exam_id") == exam_id]
    return submissions

@router.delete("/submissions/{submission_id}")
def delete_submission(submission_id: str):
    db = load_db()
    submissions = db.get("submissions", [])
    for idx, s in enumerate(submissions):
        if s["id"] == submission_id:
            del submissions[idx]
            save_db(db)
            return {"detail": "Submission deleted"}
    raise HTTPException(status_code=404, detail="Submission not found")

@router.get("/{exam_id}")
def get_exam(exam_id: str):
    db = load_db()
    for exam in db.get("exams", []):
        if exam["id"] == exam_id:
            return exam
    raise HTTPException(status_code=404, detail="Exam not found")

@router.post("")
def create_exam(req: CreateExamRequest):
    db = load_db()
    exam_id = f"exam_{uuid.uuid4().hex[:8]}"
    new_exam = {
        "id": exam_id,
        "title": req.title,
        "subject": req.subject,
        "grade": req.grade,
        "duration_minutes": req.duration_minutes,
        "created_at": datetime.now().isoformat(),
        "questions": [q.dict() for q in req.questions]
    }
    db["exams"].insert(0, new_exam)
    save_db(db)
    return new_exam

@router.post("/{exam_id}/submit")
def submit_exam(exam_id: str, req: StudentSubmissionRequest):
    db = load_db()
    exam = None
    for e in db.get("exams", []):
        if e["id"] == exam_id:
            exam = e
            break
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    questions = exam.get("questions", [])
    total_q = len(questions)
    correct_count = 0
    detailed_results = []

    for q in questions:
        q_id = q["id"]
        student_ans = req.answers.get(q_id, "")
        correct_ans = q.get("correct_answer", "")
        student_ans_clean = student_ans.replace("(", "").replace(")", "").strip().upper()
        correct_ans_clean = correct_ans.replace("(", "").replace(")", "").strip().upper()
        is_correct = (student_ans_clean == correct_ans_clean)
        if is_correct:
            correct_count += 1

        detailed_results.append({
            "question_id": q_id,
            "question_number": q.get("question_number", ""),
            "stem": q.get("stem", ""),
            "options": q.get("options", []),
            "student_answer": student_ans,
            "correct_answer": correct_ans,
            "is_correct": is_correct,
            "explanation": q.get("explanation", ""),
            "stimulus_text": q.get("stimulus_text", "")
        })

    score = round((correct_count / max(1, total_q)) * 10.0, 2)
    submission_id = f"sub_{uuid.uuid4().hex[:8]}"

    submission_record = {
        "id": submission_id,
        "exam_id": exam_id,
        "exam_title": exam.get("title", ""),
        "student_name": req.student_name,
        "student_code": req.student_code,
        "submitted_at": datetime.now().isoformat(),
        "total_questions": total_q,
        "correct_count": correct_count,
        "score": score,
        "percentage": round((correct_count / max(1, total_q)) * 100, 1),
        "detailed_results": detailed_results
    }

    db["submissions"].insert(0, submission_record)
    save_db(db)

    return submission_record

@router.delete("/{exam_id}")
def delete_exam(exam_id: str):
    db = load_db()
    exams = db.get("exams", [])
    for idx, e in enumerate(exams):
        if e["id"] == exam_id:
            del exams[idx]
            # Clean up related submissions
            submissions = db.get("submissions", [])
            db["submissions"] = [s for s in submissions if s.get("exam_id") != exam_id]
            save_db(db)
            return {"detail": "Exam deleted"}
    raise HTTPException(status_code=404, detail="Exam not found")

@router.put("/{exam_id}")
def update_exam(exam_id: str, req: CreateExamRequest):
    db = load_db()
    for idx, e in enumerate(db.get("exams", [])):
        if e["id"] == exam_id:
            updated_exam = {
                **e,
                "title": req.title,
                "subject": req.subject,
                "grade": req.grade,
                "duration_minutes": req.duration_minutes,
                "questions": [q.dict() for q in req.questions]
            }
            db["exams"][idx] = updated_exam
            save_db(db)
            return updated_exam
    raise HTTPException(status_code=404, detail="Exam not found")

@router.post("/{exam_id}/import-answers")
async def import_answers(
    exam_id: str,
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None)
):
    db = load_db()
    exam = None
    exam_idx = -1
    for idx, e in enumerate(db.get("exams", [])):
        if e["id"] == exam_id:
            exam = e
            exam_idx = idx
            break

    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # 1. Get unstructured text from text or file
    unstructured_text = ""
    if file:
        file_suffix = Path(file.filename).suffix.lower()
        temp_file_path = TMP_DIR / f"upload_{uuid.uuid4().hex[:8]}{file_suffix}"
        temp_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_bytes = await file.read()
        with open(temp_file_path, "wb") as f:
            f.write(file_bytes)
            
        try:
            converter = PDFOCRConverter(
                model=OCR_MODEL,
                batch_size=OCR_BATCH_SIZE,
                concurrency=OCR_CONCURRENCY,
            )
            unstructured_text = converter.convert_pdf(temp_file_path)
        finally:
            if temp_file_path.exists():
                temp_file_path.unlink()
    elif raw_text:
        unstructured_text = raw_text
    else:
        raise HTTPException(status_code=400, detail="Must provide either a file or raw text input")

    # 2. Prune the exam questions to save context tokens
    pruned_questions = []
    for q in exam.get("questions", []):
        pruned_questions.append({
            "id": q.get("id"),
            "question_number": q.get("question_number"),
            "options": [opt.get("label") for opt in q.get("options", [])]
        })
        
    pruned_exam_json = json.dumps(pruned_questions, ensure_ascii=False)

    # 3. Call LLM to map unstructured text to pruned questions
    system_prompt = (
        "You are an assistant that aligns unstructured answer key texts with a structured exam format.\n"
        "Analyze the unstructured answer key text and map the correct answer label (e.g. A, B, C, or D) to each question ID.\n"
        "Return the result strictly as a JSON object where the keys are question IDs and values are the correct answer labels.\n"
        "Do not include any explanation, markdown formatting blocks (e.g. ```json), or other characters. Just return the raw JSON object."
    )
    
    prompt = (
        f"Here is the unstructured answer key text:\n"
        f"---\n"
        f"{unstructured_text}\n"
        f"---\n\n"
        f"Here is the pruned exam questions structure:\n"
        f"---\n"
        f"{pruned_exam_json}\n"
        f"---"
    )

    try:
        llm_reply = chat(
            prompt=prompt,
            system=system_prompt,
            model=ANSWER_MAPPER_MODEL,
            provider=ANSWER_MAPPER_PROVIDER
        )
        print(f"[Import Answers LLM Reply]:\n{llm_reply}")
        
        cleaned_reply = llm_reply.strip()
        # Find first '{' and last '}' to extract raw JSON block cleanly
        start_idx = cleaned_reply.find('{')
        end_idx = cleaned_reply.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_str = cleaned_reply[start_idx:end_idx+1]
        else:
            json_str = cleaned_reply
            
        mapping = json.loads(json_str)
    except Exception as e:
        import traceback
        print("[Import Answers Error Traceback]:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to align answers with LLM: {str(e)}")

    # 4. Update the correct answer for matched questions
    updated_questions = []
    for q in exam.get("questions", []):
        q_id = q.get("id")
        if q_id in mapping:
            new_ans = str(mapping[q_id]).strip().upper()
            q["correct_answer"] = new_ans
        updated_questions.append(q)

    exam["questions"] = updated_questions
    db["exams"][exam_idx] = exam
    save_db(db)

    return {
        "success": True,
        "exam": exam,
        "extracted_text": unstructured_text,
        "mapping": mapping
    }


