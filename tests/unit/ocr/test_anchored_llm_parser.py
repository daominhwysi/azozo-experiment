import pytest
from backend.app.domains.ocr.parser.long_parser.anchored_llm_parser import (
    STABLE_EXAM_PARSER_SYSTEM_PROMPT,
    find_anchor_position,
    recover_text_from_anchors,
    recover_exam_structure_from_anchors,
    AnchoredLLMExamParser,
)

SAMPLE_OCR_TEXT = """PHẦN I. Câu trắc nghiệm nhiều lựa chọn. Thí sinh trả lời từ câu 1 đến câu 2.

Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the questions.
Renewable energy has become a central focus of global climate policy over the past decade.
Solar and wind power are leading the transition toward a zero-emission future.

Câu 1. What is the main topic of the passage?
A. The history of fossil fuels
B. Solar and wind power leading energy transition
C. The discovery of electricity
D. Space exploration technologies

Câu 2. According to the passage, renewable energy is central to what?
A. Global climate policy
B. Financial markets
C. Traditional mining
D. Automotive sales
"""


def test_system_prompt_defines_both_roles():
    assert "ROLE A (PARSER)" in STABLE_EXAM_PARSER_SYSTEM_PROMPT
    assert "ROLE B (VALIDATOR)" in STABLE_EXAM_PARSER_SYSTEM_PROMPT
    assert "start_anchor" in STABLE_EXAM_PARSER_SYSTEM_PROMPT
    assert "end_anchor" in STABLE_EXAM_PARSER_SYSTEM_PROMPT


def test_anchor_position_exact_and_normalized():
    start, end = find_anchor_position(SAMPLE_OCR_TEXT, "PHẦN I. Câu trắc nghiệm")
    assert start == 0
    assert end > start

    # Test whitespace-insensitive search
    start, end = find_anchor_position(SAMPLE_OCR_TEXT, "Read the  following passage\nand mark")
    assert start != -1


def test_recover_text_from_anchors():
    text, s, e = recover_text_from_anchors(
        SAMPLE_OCR_TEXT,
        start_anchor="Read the following passage",
        end_anchor="zero-emission future."
    )
    assert "Renewable energy has become a central focus" in text
    assert text.startswith("Read the following passage")
    assert text.endswith("zero-emission future.")


def test_recover_exam_structure_from_anchors():
    payload = {
        "sections": [
            {
                "id": "sec_1",
                "start_anchor": "PHẦN I. Câu trắc nghiệm",
                "end_anchor": "câu 1 đến câu 2."
            }
        ],
        "stimuli": [
            {
                "id": "stim_1",
                "start_anchor": "Read the following passage",
                "end_anchor": "zero-emission future."
            }
        ],
        "questions": [
            {
                "id": "q_1",
                "question_number": "1",
                "section_id": "sec_1",
                "stimulus_id": "stim_1",
                "stem": {
                    "start_anchor": "Câu 1. What is the main topic",
                    "end_anchor": "topic of the passage?"
                },
                "options": [
                    {
                        "label": "A",
                        "start_anchor": "A. The history of fossil fuels",
                        "end_anchor": "fossil fuels"
                    },
                    {
                        "label": "B",
                        "start_anchor": "B. Solar and wind power",
                        "end_anchor": "energy transition"
                    }
                ],
                "correct_answer": "B",
                "explanation": {
                    "start_anchor": "",
                    "end_anchor": ""
                }
            }
        ]
    }

    questions, stimuli = recover_exam_structure_from_anchors(SAMPLE_OCR_TEXT, payload)
    assert len(questions) == 1
    assert "stim_1" in stimuli
    assert "Solar and wind power" in stimuli["stim_1"]
    assert questions[0]["question_number"] == "1"
    assert questions[0]["stimulus_id"] == "stim_1"
    assert questions[0]["stem"].startswith("Câu 1. What is the main topic")
    assert len(questions[0]["options"]) == 2
    assert questions[0]["options"][1]["label"] == "B"
    assert questions[0]["correct_answer"] == "B"


def test_two_pass_mock_completion():
    def mock_completion(messages, model=None, provider=None, max_tokens=None):
        system_content = messages[0]["content"]
        assert "ROLE A (PARSER)" in system_content
        assert "ROLE B (VALIDATOR)" in system_content

        # First call is Role A
        if len(messages) == 2:
            assert "ACTIVATE ROLE A" in messages[1]["content"]
            return '''{
                "questions": [
                    {
                        "id": "q1",
                        "question_number": "1",
                        "stem": {"start_anchor": "Câu 1. What is the main topic", "end_anchor": "of the passage?"},
                        "options": [{"label": "A", "start_anchor": "A. The history", "end_anchor": "fossil fuels"}]
                    }
                ]
            }'''

        # Second call is Role B
        if len(messages) == 4:
            assert "ACTIVATE ROLE A" in messages[1]["content"]
            assert "ACTIVATE ROLE B" in messages[3]["content"]
            assert messages[2]["role"] == "assistant"
            # Preserved thread history!
            return '''{
                "questions": [
                    {
                        "id": "q1",
                        "question_number": "1",
                        "stem": {"start_anchor": "Câu 1. What is the main topic", "end_anchor": "of the passage?"},
                        "options": [
                            {"label": "A", "start_anchor": "A. The history", "end_anchor": "fossil fuels"},
                            {"label": "B", "start_anchor": "B. Solar and wind power", "end_anchor": "energy transition"}
                        ],
                        "correct_answer": "B"
                    }
                ]
            }'''
        return "{}"

    parser = AnchoredLLMExamParser()
    res = parser.parse_exam_chunk(SAMPLE_OCR_TEXT, completion_fn=mock_completion)

    assert len(res["questions"]) == 1
    assert len(res["questions"][0]["options"]) == 2
    assert res["questions"][0]["correct_answer"] == "B"
    assert res["method"] == "llm_two_pass_anchored"
