"""
Unit tests for Editor Agent and Search/Replace Patcher Engine.
"""

from typing import Any, List
import pytest

from backend.app.domains.ocr.annotator.editor import (
    EditorAgent,
    EditorResult,
    SearchReplaceBlock,
    SearchReplacePatcher,
)
from backend.app.domains.ocr.annotator.reviewer import AuditIssue, IssueSeverity


# ---------------------------------------------------------------------------
# SearchReplacePatcher Unit Tests
# ---------------------------------------------------------------------------

def test_patcher_parse_single_block():
    llm_output = """Here is the surgical fix:
<<<<<<< SEARCH
<question_label>**Câu 1.**</question_label> <stem>Cho hàm số $y=f(x)$. a) Đồng biến. b) Nghịch biến.</stem>
=======
<question_label>**Câu 1.**</question_label> <stem>Cho hàm số $y=f(x)$.</stem>
<option_label>a)</option_label> <option_text>Đồng biến.</option_text>
<option_label>b)</option_label> <option_text>Nghịch biến.</option_text>
>>>>>>> REPLACE
<|END|>"""
    blocks = SearchReplacePatcher.parse_blocks(llm_output)
    assert len(blocks) == 1
    assert "<stem>Cho hàm số $y=f(x)$. a) Đồng biến. b) Nghịch biến.</stem>" in blocks[0].search_text
    assert "<option_label>a)</option_label>" in blocks[0].replace_text


def test_patcher_parse_multiple_blocks():
    llm_output = """```xml
<<<<<<< SEARCH
<question_label>**Câu 1.**</question_label> <stem>Old stem 1</stem>
=======
<question_label>**Câu 1.**</question_label> <stem>New stem 1</stem>
>>>>>>> REPLACE

Some commentary in between

<<<<<<< SEARCH
<question_label>**Câu 2.**</question_label> <stem>Old stem 2</stem>
=======
<question_label>**Câu 2.**</question_label> <stem>New stem 2</stem>
>>>>>>> REPLACE
```"""
    blocks = SearchReplacePatcher.parse_blocks(llm_output)
    assert len(blocks) == 2
    assert "Old stem 1" in blocks[0].search_text
    assert "New stem 1" in blocks[0].replace_text
    assert "Old stem 2" in blocks[1].search_text
    assert "New stem 2" in blocks[1].replace_text


def test_patcher_apply_exact():
    original = (
        "<section>HEADER</section>\n"
        "<question_label>**Câu 1.**</question_label> <stem>Broken stem text</stem>\n"
        "<option_label>A.</option_label> <option_text>Option A</option_text>\n"
    )
    block = SearchReplaceBlock(
        search_text="<stem>Broken stem text</stem>",
        replace_text="<stem>Repaired stem text</stem>",
    )
    patched, applied, failed = SearchReplacePatcher.apply_blocks(original, [block])
    assert applied == 1
    assert len(failed) == 0
    assert "<stem>Repaired stem text</stem>" in patched
    assert "Broken stem text" not in patched


def test_patcher_apply_line_trimmed():
    original = (
        "<section>HEADER</section>   \n"
        "<question_label>**Câu 1.**</question_label>  \n"
        "<stem>Line 1  \nLine 2  </stem>\n"
    )
    # Search block has no trailing spaces
    block = SearchReplaceBlock(
        search_text="<stem>Line 1\nLine 2</stem>",
        replace_text="<stem>Repaired Line 1\nRepaired Line 2</stem>",
    )
    patched, applied, failed = SearchReplacePatcher.apply_blocks(original, [block])
    assert applied == 1
    assert len(failed) == 0
    assert "Repaired Line 1" in patched


def test_patcher_apply_fuzzy_whitespace():
    original = "<stem>Một  vật   dao   động  điều hoà.</stem>"
    block = SearchReplaceBlock(
        search_text="<stem>Một vật dao động điều hoà.</stem>",
        replace_text="<stem>Một chất điểm dao động điều hoà.</stem>",
    )
    patched, applied, failed = SearchReplacePatcher.apply_blocks(original, [block])
    assert applied == 1
    assert "Một chất điểm dao động điều hoà." in patched


def test_patcher_failed_block_handling():
    original = "<stem>Actual text</stem>"
    block = SearchReplaceBlock(
        search_text="<stem>Non-existent text</stem>",
        replace_text="<stem>Replacement</stem>",
    )
    patched, applied, failed = SearchReplacePatcher.apply_blocks(original, [block])
    assert applied == 0
    assert len(failed) == 1
    assert "SEARCH block not found" in failed[0]
    assert patched == original


# ---------------------------------------------------------------------------
# EditorAgent Functional Tests
# ---------------------------------------------------------------------------

def test_editor_agent_deterministic_preclean():
    """Verifies that pure syntax errors (unclosed stems, math inequalities) are resolved deterministically."""
    raw_ocr = "Câu 1. Biểu thức x < 5 và y > 10. A. 1 B. 2"
    bad_xml = "<question_label>Câu 1.</question_label> <stem>Biểu thức x < 5 và y > 10. <option_label>A.</option_label> <option_text>1</option_text> <option_label>B.</option_label> <option_text>2</option_text>"

    editor = EditorAgent()
    res = editor.repair_document(
        annotated_xml=bad_xml,
        raw_ocr_text=raw_ocr,
        doc_id="test_det_clean",
    )
    assert res.success is True
    assert res.deterministic_only is True
    assert "</stem>" in res.repaired_xml
    assert res.final_decision == "PASS"


def test_editor_agent_sub_question_segmentation_mock():
    """Verifies end-to-end mock repair for absorbed True/False sub-questions."""
    raw_ocr = (
        "Câu 1: Cho hàm số y = f(x).\n"
        "a) Hàm số đồng biến trên khoảng (0; 2).\n"
        "b) Hàm số có 3 điểm cực trị."
    )
    absorbed_xml = (
        "<question_label>Câu 1:</question_label> "
        "<stem>Cho hàm số y = f(x).\n"
        "a) Hàm số đồng biến trên khoảng (0; 2).\n"
        "b) Hàm số có 3 điểm cực trị.</stem>"
    )

    issues = [
        AuditIssue(
            category="option_structure",
            severity=IssueSeverity.MAJOR,
            message="Sub-questions a) and b) absorbed into stem without option_label tags.",
            context_snippet="a) Hàm số đồng biến...",
        )
    ]

    mock_diff_response = """<<<<<<< SEARCH
<stem>Cho hàm số y = f(x).
a) Hàm số đồng biến trên khoảng (0; 2).
b) Hàm số có 3 điểm cực trị.</stem>
=======
<stem>Cho hàm số y = f(x).</stem>
<option_label>a)</option_label> <option_text>Hàm số đồng biến trên khoảng (0; 2).</option_text>
<option_label>b)</option_label> <option_text>Hàm số có 3 điểm cực trị.</option_text>
>>>>>>> REPLACE"""

    def mock_completion(messages: List[Any], **kwargs: Any) -> str:
        return mock_diff_response

    editor = EditorAgent()
    res = editor.repair_document(
        annotated_xml=absorbed_xml,
        raw_ocr_text=raw_ocr,
        issues=issues,
        doc_id="test_sub_q",
        completion_fn=mock_completion,
    )

    assert "<option_label>a)</option_label>" in res.repaired_xml
    assert "<option_text>Hàm số đồng biến" in res.repaired_xml
    assert "<option_label>b)</option_label>" in res.repaired_xml


def test_editor_agent_stimulus_anchor_repair_mock():
    """Verifies end-to-end mock repair for broken stimulus anchors."""
    raw_ocr = (
        "Dựa vào thông tin sau đây để trả lời các câu từ 1 đến 2: Đoạn văn mẫu thí nghiệm hóa học.\n"
        "Câu 1. Hiện tượng là gì? A. Kết tủa B. Khí\n"
        "Câu 2. Chất sinh ra là gì? A. CO2 B. H2O"
    )
    bad_anchor_xml = (
        '<stimulus id="stim_1" start_anchor="Không_tồn_tại" end_anchor="Không_khớp" />\n'
        "<question_label>Câu 1.</question_label> <stem>Hiện tượng là gì?</stem> <option_label>A.</option_label> <option_text>Kết tủa</option_text> <option_label>B.</option_label> <option_text>Khí</option_text>\n"
        "<question_label>Câu 2.</question_label> <stem>Chất sinh ra là gì?</stem> <option_label>A.</option_label> <option_text>CO2</option_text> <option_label>B.</option_label> <option_text>H2O</option_text>"
    )

    issues = [
        AuditIssue(
            category="stimulus",
            severity=IssueSeverity.MAJOR,
            message="Stimulus #1 start_anchor not found in raw source document text.",
        )
    ]

    mock_diff_response = """<<<<<<< SEARCH
<stimulus id="stim_1" start_anchor="Không_tồn_tại" end_anchor="Không_khớp" />
=======
<stimulus id="stim_1" start_anchor="Dựa vào thông tin sau đây" end_anchor="thí nghiệm hóa học." />
>>>>>>> REPLACE"""

    def mock_completion(messages: List[Any], **kwargs: Any) -> str:
        return mock_diff_response

    editor = EditorAgent()
    res = editor.repair_document(
        annotated_xml=bad_anchor_xml,
        raw_ocr_text=raw_ocr,
        issues=issues,
        doc_id="test_stimulus_fix",
        completion_fn=mock_completion,
    )

    assert 'start_anchor="Dựa vào thông tin sau đây"' in res.repaired_xml
    assert 'end_anchor="thí nghiệm hóa học."' in res.repaired_xml
