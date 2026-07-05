import json
from typing import Dict, Any
from datetime import datetime
from backend.app.config import DB_FILE

def load_db() -> Dict[str, Any]:
    if not DB_FILE.exists():
        initial_db = {
            "exams": [
                {
                    "id": "exam_math_101",
                    "title": "Đề Khảo Sát Tốt Nghiệp THPT Môn Toán 2026 - Hải Phòng",
                    "subject": "Toán Học",
                    "grade": "Lớp 12",
                    "duration_minutes": 45,
                    "created_at": datetime.now().isoformat(),
                    "questions": [
                        {
                            "id": "q1",
                            "question_number": "Câu 1",
                            "stem": "Trong không gian với hệ trục tọa độ Oxyz, cho các điểm A(2;2;3), B(2;-2;-1). Tọa độ của điểm M thoả mãn hệ thức MA + 3MB = 0 là",
                            "options": [
                                {"label": "A", "text": "(2;-1;1)"},
                                {"label": "B", "text": "(2;-1;0)"},
                                {"label": "C", "text": "(-2;-1;0)"},
                                {"label": "D", "text": "(2;1;0)"}
                            ],
                            "correct_answer": "B",
                            "explanation": "Ta có 3MB = (6-3x; -6-3y; -3-3z), MA = (2-x; 2-y; 3-z). Từ MA + 3MB = 0 suy ra M(2; -1; 0)."
                        },
                        {
                            "id": "q2",
                            "question_number": "Câu 2",
                            "stem": "Cho hàm số f(x) có bảng biến thiên với giá trị cực đại bằng 3 tại x = 2. Giá trị cực đại của hàm số đã cho bằng:",
                            "options": [
                                {"label": "A", "text": "3"},
                                {"label": "B", "text": "-2"},
                                {"label": "C", "text": "-1"},
                                {"label": "D", "text": "2"}
                            ],
                            "correct_answer": "A",
                            "explanation": "Dựa vào bảng biến thiên, giá trị cực đại của hàm số f(x) là 3 tại x = 2."
                        },
                        {
                            "id": "q3",
                            "question_number": "Câu 3",
                            "stem": "Cho hình chóp S.ABC có đáy ABC là tam giác vuông tại B, SA vuông góc với (ABC). Biết SA = AB = 4a, BC = 3a. Thể tích khối chóp S.ABC bằng:",
                            "options": [
                                {"label": "A", "text": "4a³"},
                                {"label": "B", "text": "8a³"},
                                {"label": "C", "text": "16a³"},
                                {"label": "D", "text": "24a³"}
                            ],
                            "correct_answer": "B",
                            "explanation": "Diện tích đáy S_ABC = 1/2 * AB * BC = 1/2 * 4a * 3a = 6a². Thể tích V = 1/3 * SA * S_ABC = 1/3 * 4a * 6a² = 8a³."
                        }
                    ]
                }
            ],
            "submissions": []
        }
        DB_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(initial_db, f, ensure_ascii=False, indent=2)
        return initial_db

    with open(DB_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_db(data: Dict[str, Any]):
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
