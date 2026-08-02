import json
import pytest
from backend.app.domains.ocr.parser.long_parser.det_anchor_worker import DetAnchorParserWorker
from backend.app.domains.ocr.parser.long_parser.pipeline import LongContextParserPipeline


def _mock_anchor_completion(payload):
    def complete(**kwargs):
        return json.dumps(payload, ensure_ascii=False)

    return complete


def test_det_anchor_worker_processes_mcq_chunk_without_stimulus():
    raw_text = (
        "**1.** What is the capital of France?\n"
        "A. London\nB. Paris\nC. Berlin\nD. Rome\n\n"
        "**2.** What is 2 + 2?\n"
        "A. 3\nB. 4\nC. 5\nD. 6\n\n"
        "**3.** What is the capital of Japan?\n"
        "A. Tokyo\nB. Kyoto\nC. Osaka\nD. Nagoya\n"
    )

    worker = DetAnchorParserWorker(use_llm_fallback=False)
    # Stub out completion for anchor agent (no stimulus present in prompt text)
    worker.anchor_agent.completion = _mock_anchor_completion([])

    result = worker.process_chunk(raw_text, chunk_index=0)

    assert result["parse_status"] == "ok"
    assert result["method"] == "det_parser+anchor_extraction"
    assert len(result["questions"]) == 3
    assert result["questions"][0]["question_number"] == "**1.**"
    assert "capital of France" in result["questions"][0]["stem"]
    assert len(result["questions"][0]["options"]) == 4
    assert result["questions"][0]["options"][1]["text"] == "Paris"
    assert result["questions"][1]["question_number"] == "**2.**"
    assert result["questions"][2]["question_number"] == "**3.**"


def test_det_anchor_worker_integrates_stimulus_spans_with_det_questions():
    raw_text = (
        "PHẦN II. ĐỌC HIỂU\n"
        "Read the following passage and answer the questions.\n\n"
        "Solar power is energy from the sun that is converted into thermal or electrical energy. "
        "It is the cleanest and most abundant renewable energy source available.\n\n"
        "**1.** What is solar power?\n"
        "A. Energy from wind\nB. Energy from sun\nC. Energy from water\nD. Energy from coal\n\n"
        "**2.** Why is solar power beneficial?\n"
        "A. Cheap\nB. Clean and abundant\nC. Dangerous\nD. Scarce\n\n"
        "**3.** Solar power is converted into what?\n"
        "A. Motion\nB. Thermal or electrical energy\nC. Sound\nD. Light only\n"
    )

    stimulus_start = "Read the following passage and answer the questions."
    stimulus_end = "most abundant renewable energy source available."

    mock_anchors = [
        {
            "label": "section",
            "start_anchor": "PHẦN II. ĐỌC HIỂU",
            "end_anchor": "PHẦN II. ĐỌC HIỂU",
            "confidence": 0.99,
        },
        {
            "label": "stimulus",
            "start_anchor": stimulus_start,
            "end_anchor": stimulus_end,
            "confidence": 0.98,
        },
    ]

    worker = DetAnchorParserWorker(use_llm_fallback=False)
    worker.anchor_agent.completion = _mock_anchor_completion(mock_anchors)

    result = worker.process_chunk(raw_text, chunk_index=0)

    assert result["parse_status"] == "ok"
    assert len(result["questions"]) == 3
    assert len(result["stimuli"]) == 1

    stim_id = list(result["stimuli"].keys())[0]
    assert "Solar power is energy from the sun" in result["stimuli"][stim_id]
    # Check that questions inherit the active stimulus_id
    assert result["questions"][0]["stimulus_id"] == stim_id
    assert result["questions"][1]["stimulus_id"] == stim_id
    assert result["questions"][2]["stimulus_id"] == stim_id
    assert "Solar power is energy" in result["questions"][0]["stimulus_text"]


def test_pipeline_initialization_with_det_anchor():
    pipeline = LongContextParserPipeline(use_det_anchor=True)
    assert pipeline.use_det_anchor is True
