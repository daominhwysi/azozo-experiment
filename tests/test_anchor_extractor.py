import json

from backend.app.domains.ocr.parser.long_parser.anchor_extractor import (
    AnchorExtractionError,
    AnchorStructureAgent,
    parse_anchor_proposals,
    resolve_anchor_proposals,
)


def _completion_with(payload):
    def complete(**kwargs):
        assert "TARGET_TEXT_START" in kwargs["prompt"]
        assert "Never extract questions" in kwargs["system"]
        return json.dumps(payload, ensure_ascii=False)

    return complete


def test_extracts_only_source_backed_section_and_stimulus_spans():
    raw = (
        "ĐỀ THI THỬ\n\n"
        "PHẦN II. ĐỌC HIỂU\n"
        "Đọc đoạn văn sau và trả lời các câu hỏi.\n\n"
        "The river supports farms and wildlife.\n"
        "It also supplies drinking water.\n\n"
        "**1.** What does the river support?\n"
        "A. Farms\nB. Roads\n"
    )
    section = "PHẦN II. ĐỌC HIỂU"
    stimulus_start = "Đọc đoạn văn sau và trả lời các câu hỏi."
    stimulus_end = "It also supplies drinking water."
    extractor = AnchorStructureAgent(
        model="test-model",
        provider="test-provider",
        completion=_completion_with(
            [
                {
                    "label": "section",
                    "start_anchor": section,
                    "end_anchor": section,
                },
                {
                    "label": "stimulus",
                    "start_anchor": stimulus_start,
                    "end_anchor": stimulus_end,
                },
            ]
        ),
    )

    result = extractor.extract(raw)

    assert [span.label for span in result.spans] == ["section", "stimulus"]
    assert result.spans[0].text == section
    assert result.spans[1].text == (
        "Đọc đoạn văn sau và trả lời các câu hỏi.\n\n"
        "The river supports farms and wildlife.\n"
        "It also supplies drinking water."
    )
    assert "**1.**" not in result.spans[1].text
    assert all(span.start_token is not None for span in result.spans)
    assert all(span.end_token > span.start_token for span in result.spans)
    assert result.rejected == []


def test_question_proposals_are_rejected_even_when_anchors_are_valid():
    raw = "SECTION A\nPassage body.\n1. A question?"
    response = json.dumps(
        [
            {
                "label": "question",
                "start_anchor": "1.",
                "end_anchor": "A question?",
            },
            {
                "label": "section",
                "start_anchor": "SECTION A",
                "end_anchor": "SECTION A",
            },
        ]
    )

    proposals, rejected = parse_anchor_proposals(response)
    spans, resolution_rejected = resolve_anchor_proposals(raw, proposals)

    assert [span.label for span in spans] == ["section"]
    assert rejected == [
        {"index": 0, "label": "question", "reason": "label_not_allowed"}
    ]
    assert resolution_rejected == []


def test_hallucinated_or_modified_anchors_are_not_fuzzily_accepted():
    raw = "PHẦN I\nĐọc văn bản gốc.\n1. Câu hỏi"
    response = json.dumps(
        [
            {
                "label": "stimulus",
                "start_anchor": "Đọc văn bản đã sửa.",
                "end_anchor": "văn bản gốc.",
            }
        ],
        ensure_ascii=False,
    )

    proposals, _ = parse_anchor_proposals(response)
    spans, rejected = resolve_anchor_proposals(raw, proposals)

    assert spans == []
    assert rejected[0]["reason"] == "anchors_not_resolvable"


def test_repeated_anchor_pairs_resolved_monotonically():
    repeated = "Read the passage.\nSame ending."
    raw = f"{repeated}\n\nFiller\n\n{repeated}\n\n1. Question"
    response = json.dumps(
        [
            {
                "label": "stimulus",
                "start_anchor": "Read the passage.",
                "end_anchor": "Same ending.",
            },
            {
                "label": "stimulus",
                "start_anchor": "Read the passage.",
                "end_anchor": "Same ending.",
            },
        ]
    )

    proposals, _ = parse_anchor_proposals(response)
    spans, rejected = resolve_anchor_proposals(raw, proposals)

    assert rejected == []
    assert len(spans) == 2
    assert spans[0].start == 0
    assert spans[1].start == raw.rfind("Read the passage.")


def test_span_dicts_match_parser_character_span_shape():
    raw = "PART 1\nA shared notice."
    extractor = AnchorStructureAgent(
        completion=_completion_with(
            [
                {
                    "label": "section",
                    "start_anchor": "PART 1",
                    "end_anchor": "PART 1",
                }
            ]
        )
    )

    span = extractor.extract(raw).span_dicts()[0]

    assert span["start"] == 0
    assert span["end"] == len("PART 1")
    assert span["label"] == "section"
    assert span["text"] == "PART 1"
    assert span["start_token"] == 0
    assert span["end_token"] == 2


def test_invalid_json_raises_clear_error():
    try:
        parse_anchor_proposals("not JSON")
    except AnchorExtractionError as exc:
        assert "JSON array" in str(exc)
    else:
        raise AssertionError("Invalid JSON must raise AnchorExtractionError")
