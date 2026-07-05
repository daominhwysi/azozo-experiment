from typing import List, Dict, Optional
from pydantic import BaseModel

class QuestionOption(BaseModel):
    label: str
    text: str

class ExamQuestion(BaseModel):
    id: str
    question_number: str
    stem: str
    options: List[QuestionOption]
    correct_answer: Optional[str] = "A"
    explanation: Optional[str] = ""
    stimulus_id: Optional[str] = None

class CreateExamRequest(BaseModel):
    title: str
    subject: str
    grade: str
    duration_minutes: int = 45
    questions: List[ExamQuestion]

class StudentSubmissionRequest(BaseModel):
    student_name: str
    student_code: Optional[str] = "STU001"
    answers: Dict[str, str]  # { "q1": "B", "q2": "A" }
