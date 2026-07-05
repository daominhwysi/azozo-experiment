import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from backend.app.models import CreateExamRequest, StudentSubmissionRequest
from backend.app.database import load_db, save_db

router = APIRouter(prefix="/api/exams", tags=["exams"])

@router.get("")
def get_exams():
    db = load_db()
    return db.get("exams", [])

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
        correct_ans = q.get("correct_answer", "A")
        is_correct = (student_ans.strip().upper() == correct_ans.strip().upper())
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
            "explanation": q.get("explanation", "")
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
