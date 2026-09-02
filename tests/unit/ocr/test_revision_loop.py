"""Tests for isolated editor/reviewer revision orchestration."""

from typing import Any, Dict, List
from unittest.mock import Mock

from backend.app.domains.ocr.annotator.editor import EditorAgent
from backend.app.domains.ocr.annotator.reviewer import (
    AnnotationReviewerAgent,
    AuditIssue,
    IssueSeverity,
    ReviewDecision,
    ReviewReport,
)
from backend.app.domains.ocr.annotator.revision_loop import EditorReviewerLoop


def _report(score: float, decision: ReviewDecision, issue: str = "") -> ReviewReport:
    issues = []
    if issue:
        issues.append(
            AuditIssue(
                category="option_structure",
                severity=IssueSeverity.MAJOR,
                message=issue,
            )
        )
    return ReviewReport(
        doc_id="exam_1",
        overall_score=score,
        deterministic_score=score,
        grade="A" if score >= 90 else "B",
        decision=decision,
        is_malfunctioned=False,
        issues=issues,
    )


def test_editor_keeps_history_and_reviewer_is_stateless() -> None:
    editor_calls: List[List[Dict[str, str]]] = []

    responses = iter(
        [
            """<<<<<<< SEARCH
<stem>Bad</stem>
=======
<stem>Better</stem>
>>>>>>> REPLACE""",
            """<<<<<<< SEARCH
<stem>Better</stem>
=======
<stem>Correct</stem>
>>>>>>> REPLACE""",
        ]
    )

    def complete(messages: List[Dict[str, str]], **_: Any) -> str:
        editor_calls.append(messages)
        return next(responses)

    reviewer = Mock(spec=AnnotationReviewerAgent)
    reviewer.review_document.side_effect = [
        _report(60, ReviewDecision.NEEDS_REVISION, "Initial error"),
        _report(75, ReviewDecision.NEEDS_REVISION, "Still incorrect"),
        _report(95, ReviewDecision.PASS),
    ]

    loop = EditorReviewerLoop(
        editor=EditorAgent(), reviewer=reviewer, max_rounds=3
    )
    result = loop.run(
        annotated_xml="<stem>Bad</stem>",
        raw_ocr_text="Correct",
        doc_id="exam_1",
        editor_completion_fn=complete,
    )

    assert result.success is True
    assert result.rounds_completed == 2
    assert result.repaired_xml == "<stem>Correct</stem>"
    assert len(editor_calls[0]) == 2
    assert len(editor_calls[1]) == 4
    assert "Still incorrect" in editor_calls[1][-1]["content"]

    review_calls = reviewer.review_document.call_args_list
    assert len(review_calls) == 3
    for call in review_calls:
        assert set(call.kwargs) == {
            "xml_content",
            "raw_ocr_text",
            "doc_id",
            "use_llm",
        }
        assert call.kwargs["raw_ocr_text"] == "Correct"


def test_loop_returns_highest_scoring_version_at_round_limit() -> None:
    responses = iter(
        [
            """<<<<<<< SEARCH
<stem>Bad</stem>
=======
<stem>Best</stem>
>>>>>>> REPLACE""",
            """<<<<<<< SEARCH
<stem>Best</stem>
=======
<stem>Worse</stem>
>>>>>>> REPLACE""",
        ]
    )

    reviewer = Mock(spec=AnnotationReviewerAgent)
    reviewer.review_document.side_effect = [
        _report(60, ReviewDecision.NEEDS_REVISION, "Initial error"),
        _report(82, ReviewDecision.NEEDS_REVISION, "One issue remains"),
        _report(70, ReviewDecision.NEEDS_REVISION, "Regression"),
    ]
    loop = EditorReviewerLoop(
        editor=EditorAgent(), reviewer=reviewer, max_rounds=2
    )

    result = loop.run(
        annotated_xml="<stem>Bad</stem>",
        raw_ocr_text="Best",
        editor_completion_fn=lambda **_: next(responses),
    )

    assert result.success is False
    assert result.final_score == 82
    assert result.repaired_xml == "<stem>Best</stem>"
    assert result.rounds_completed == 2


def test_loop_prefers_valid_candidate_over_high_score_discard() -> None:
    responses = iter(
        [
            """<<<<<<< SEARCH
<stem>Bad</stem>
=======
<stem>Critical Broken</stem>
>>>>>>> REPLACE""",
            """<<<<<<< SEARCH
<stem>Critical Broken</stem>
=======
<stem>Fixed Quality</stem>
>>>>>>> REPLACE""",
        ]
    )

    reviewer = Mock(spec=AnnotationReviewerAgent)
    reviewer.review_document.side_effect = [
        _report(75, ReviewDecision.NEEDS_REVISION, "Initial issue"),
        # Round 1: triggers a critical issue, falls back to unreviewed det_score 87.0 (DISCARD)
        _report(87, ReviewDecision.DISCARD, "Critical stimulus nesting"),
        # Round 2: properly fixed, gets valid NEEDS_REVISION score 80.0
        _report(80, ReviewDecision.NEEDS_REVISION, "Minor note"),
    ]
    loop = EditorReviewerLoop(
        editor=EditorAgent(), reviewer=reviewer, max_rounds=2
    )

    result = loop.run(
        annotated_xml="<stem>Bad</stem>",
        raw_ocr_text="Fixed Quality",
        editor_completion_fn=lambda **_: next(responses),
    )

    # Must prefer Round 2 (NEEDS_REVISION at 80.0) over Round 1 (DISCARD at 87.0)
    assert result.final_decision == ReviewDecision.NEEDS_REVISION.value
    assert result.final_score == 80
    assert result.repaired_xml == "<stem>Fixed Quality</stem>"

