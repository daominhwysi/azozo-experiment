import pytest
import json
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock

from backend.app.domains.ocr.annotator.reviewer import (
    AnnotationReviewerAgent,
    DeterministicAuditor,
    DeepSeekReviewer,
    ReviewDecision,
    IssueSeverity,
    ReviewReport,
    BatchReviewSummary,
    compute_grade,
)


@pytest.fixture
def valid_xml():
    return """<section># ĐỀ THI KHẢO SÁT CHẤT LƯỢNG</section>

<question_label>**Câu 1.**</question_label> <stem>Trong không gian $Oxyz$, cho điểm $A(1;2;3)$. Tọa độ hình chiếu của $A$ lên mặt phẳng $(Oxy)$ là</stem>
- <option_label>A.</option_label> <option_text>$(1;2;0)$.</option_text>
- <option_label>B.</option_label> <option_text>$(1;0;3)$.</option_text>
- <option_label>C.</option_label> <option_text>$(0;2;3)$.</option_text>
- <option_label>D.</option_label> <option_text>$(0;0;3)$.</option_text>

<stimulus id="stim_1" start_anchor="Dựa vào thông tin sau" end_anchor="trả lời câu 2 và 3." />

<question_label>**Câu 2.**</question_label> <stem>Tính giá trị của biểu thức $P$.</stem>
- <option_label>A.</option_label> <option_text>10.</option_text>
- <option_label>B.</option_label> <option_text>20.</option_text>

<question_label>**Câu 3.**</question_label> <stem>Tính giá trị của biểu thức $Q$.</stem>
- <option_label>A.</option_label> <option_text>30.</option_text>
- <option_label>B.</option_label> <option_text>40.</option_text>
"""


@pytest.fixture
def broken_xml_unclosed():
    return """<section># ĐỀ THI KHẢO SÁT</section>
<question_label>**Câu 1.**</question_label> <stem>Tính tích phân $\\int_0^1 x dx$.
- <option_label>A.</option_label> <option_text>1/2.</option_text>
"""


@pytest.fixture
def broken_xml_prohibited_tags():
    return """<pages>
<page>
<page_metadata>
{"p": 1}
</page_metadata>
<section># ĐỀ THI</section>
<question_label>**Câu 1.**</question_label> <stem>Biểu thức nào sau đây đúng?</stem>
<option_label>A.</option_label> <option_text>Đúng</option_text>
</page>
</pages>
"""


@pytest.fixture
def broken_xml_no_questions():
    return """<section># ĐỀ THI THỬ THPT QUỐC GIA</section>
Đây là phần giới thiệu hướng dẫn làm bài thi. Thí sinh đọc kỹ đề trước khi làm.
"""


def test_grade_computation():
    assert compute_grade(95.0) == "A"
    assert compute_grade(85.0) == "B"
    assert compute_grade(75.0) == "C"
    assert compute_grade(65.0) == "D"
    assert compute_grade(45.0) == "F"


def test_deterministic_auditor_valid_xml(valid_xml):
    issues, score = DeterministicAuditor.check_xml_syntax(valid_xml)
    assert score == 100.0
    assert len(issues) == 0

    proh_issues, proh_score = DeterministicAuditor.check_prohibited_tags(valid_xml)
    assert proh_score == 100.0
    assert len(proh_issues) == 0

    q_issues, q_score, metrics = DeterministicAuditor.check_question_and_option_structure(valid_xml)
    assert q_score == 100.0
    assert metrics["questions_count"] == 3
    assert metrics["option_labels_count"] == 8
    assert metrics["option_texts_count"] == 8


def test_deterministic_auditor_unclosed_tag(broken_xml_unclosed):
    issues, score = DeterministicAuditor.check_xml_syntax(broken_xml_unclosed)
    assert score < 80.0
    assert any(iss.severity == IssueSeverity.CRITICAL for iss in issues)
    assert any("Unclosed tag '<stem>'" in iss.message for iss in issues)


def test_deterministic_auditor_prohibited_tags(broken_xml_prohibited_tags):
    issues, score = DeterministicAuditor.check_prohibited_tags(broken_xml_prohibited_tags)
    assert score < 60.0
    assert any("pages" in iss.message for iss in issues)
    assert any("page_metadata" in iss.message for iss in issues)


def test_deterministic_auditor_zero_questions(broken_xml_no_questions):
    issues, score, metrics = DeterministicAuditor.check_question_and_option_structure(broken_xml_no_questions)
    assert metrics["questions_count"] == 0
    assert score == 0.0
    assert any(iss.severity == IssueSeverity.CRITICAL for iss in issues)


def test_verbatim_retention_checks():
    raw_ocr = "Đây là văn bản OCR của đề thi môn toán với nhiều nội dung dài dòng và chi tiết."
    # Severe truncation
    short_xml = "<question_label>1.</question_label> <stem>Đây</stem>"
    issues, score, metrics = DeterministicAuditor.check_verbatim_alignment(short_xml, raw_ocr)
    assert metrics["retention_ratio"] < 0.65
    assert any(iss.severity == IssueSeverity.CRITICAL for iss in issues)
    assert any("Severe text truncation" in iss.message for iss in issues)


def test_sequence_continuity_loops():
    loop_xml = "\n".join([f"<question_label>**Câu 1.**</question_label> <stem>Stem {i}</stem>" for i in range(10)])
    issues, score = DeterministicAuditor.check_sequence_continuity(loop_xml)
    assert any("repetition loop" in iss.message for iss in issues)
    assert score < 50.0


def test_review_document_pass_without_llm(valid_xml):
    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(valid_xml, use_llm=False)
    assert report.decision == ReviewDecision.PASS
    assert report.overall_score >= 85.0
    assert not report.is_malfunctioned
    assert len(report.discard_reasons) == 0


def test_review_document_discard_on_corrupted(broken_xml_unclosed):
    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(broken_xml_unclosed, use_llm=False)
    assert report.decision == ReviewDecision.DISCARD
    assert report.is_malfunctioned
    assert len(report.discard_reasons) > 0


@patch("backend.app.domains.ocr.annotator.reviewer.chat")
def test_review_document_with_mocked_deepseek(mock_chat, valid_xml):
    mock_llm_response = json.dumps({
        "score": 95.0,
        "decision": "PASS",
        "is_malfunctioned": False,
        "discard_reasons": [],
        "rubric_scores": {
            "xml_well_formedness": 100.0,
            "schema_conformance": 100.0,
            "verbatim_fidelity": 95.0,
            "sequence_continuity": 100.0,
            "question_option_completeness": 95.0,
            "stimulus_accuracy": 90.0,
        },
        "issues": [
            {
                "category": "stimulus",
                "severity": "MINOR",
                "message": "Stimulus covers 2 questions appropriately.",
                "context_snippet": None
            }
        ],
        "summary": "High-quality exam sequence labelling with clean XML."
    })
    mock_chat.return_value = mock_llm_response

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(valid_xml, use_llm=True)
    assert report.decision == ReviewDecision.PASS
    assert report.overall_score >= 90.0
    assert report.grade == "A"
    assert "High-quality" in report.summary


def test_discard_document_and_quarantine(tmp_path, broken_xml_unclosed):
    # Setup test workspace
    input_exam_dir = tmp_path / "sequence_labelling_annotated" / "Math" / "exam_999"
    input_exam_dir.mkdir(parents=True)
    xml_file = input_exam_dir / "merged.xml"
    xml_file.write_text(broken_xml_unclosed, encoding="utf-8")

    discard_dir = tmp_path / "sequence_labelling_discarded"

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_file(xml_file, use_llm=False)
    assert report.decision == ReviewDecision.DISCARD

    # Perform discard quarantine
    discard_res = agent.discard_document(
        xml_path=xml_file,
        report=report,
        discard_dir=discard_dir,
        dry_run=False,
    )

    assert discard_res["success"]
    assert not input_exam_dir.exists(), "Source directory should have been moved"

    quarantined_dir = discard_dir / "Math" / "exam_999"
    assert quarantined_dir.exists(), "Target quarantined directory must exist"
    assert (quarantined_dir / "merged.xml").exists()
    assert (quarantined_dir / "audit_report.json").exists()

    audit_data = json.loads((quarantined_dir / "audit_report.json").read_text(encoding="utf-8"))
    assert audit_data["decision"] == "DISCARD"
    assert audit_data["is_malfunctioned"] is True


def test_batch_review_flow(tmp_path, valid_xml, broken_xml_unclosed):
    annot_base = tmp_path / "annotated"
    exam1 = annot_base / "exam_1"
    exam2 = annot_base / "exam_2"
    exam1.mkdir(parents=True)
    exam2.mkdir(parents=True)

    (exam1 / "merged.xml").write_text(valid_xml, encoding="utf-8")
    (exam2 / "merged.xml").write_text(broken_xml_unclosed, encoding="utf-8")

    discard_base = tmp_path / "discarded"

    agent = AnnotationReviewerAgent(min_score=75)
    summary = agent.batch_review(
        annotated_dir=annot_base,
        discard_dir=discard_base,
        auto_discard=True,
        use_llm=False,
        concurrency=2,
    )

    assert summary.total_documents == 2
    assert summary.passed_count == 1
    assert summary.discarded_count == 1
    assert len(summary.discarded_paths) == 1

    # Check export markdown report
    report_file = tmp_path / "report.md"
    md_content = agent.export_markdown_report(summary, report_file)
    assert "# 📋 Annotation Quality Audit" in md_content
    assert "Passed" in md_content
    assert report_file.exists()
