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
    assert score == 90.0
    assert any(iss.severity == IssueSeverity.MAJOR for iss in issues)
    assert any("Unclosed tag '<stem>'" in iss.message for iss in issues)
    assert not any(iss.severity == IssueSeverity.CRITICAL for iss in issues)


def test_deterministic_auditor_mismatched_tag():
    mismatched_xml = """<section># ĐỀ THI</section>
<question_label>**Câu 1.**</question_label> <stem>Nội dung câu hỏi</option_text>
- <option_label>A.</option_label> <option_text>A</option_text>
"""
    issues, score = DeterministicAuditor.check_xml_syntax(mismatched_xml)
    assert score == 85.0
    assert any(iss.severity == IssueSeverity.MAJOR for iss in issues)
    assert any("Mismatched closing tag" in iss.message for iss in issues)
    assert not any(iss.severity == IssueSeverity.CRITICAL for iss in issues)

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(mismatched_xml, use_llm=False)
    assert report.decision == ReviewDecision.NEEDS_REVISION
    assert not report.is_malfunctioned


def test_deterministic_auditor_mid_tag_eof_truncation_is_critical():
    truncated_xml = """<section># ĐỀ THI</section>
<question_label>**Câu 1.**</question_label> <stem>Nội dung</stem>
<opt"""
    issues, score = DeterministicAuditor.check_xml_syntax(truncated_xml)
    assert score <= 60.0
    assert any(iss.severity == IssueSeverity.CRITICAL for iss in issues)
    assert any("truncated mid-tag" in iss.message for iss in issues)

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(truncated_xml, use_llm=False)
    assert report.decision == ReviewDecision.DISCARD
    assert report.is_malfunctioned is True


def test_trailing_unclosed_explanation_moves_to_needs_revision():
    # 50-question document where last question has unclosed <explanation>
    blocks = []
    for i in range(1, 50):
        blocks.append(
            f"<question_label>**Câu {i}.**</question_label> <stem>Câu hỏi số {i}.</stem>\n"
            f"- <option_label>A.</option_label> <option_text>Opt A</option_text>\n"
            f"- <option_label>B.</option_label> <option_text>Opt B</option_text>\n"
            f"<explanation>Lời giải câu {i}.</explanation>"
        )
    blocks.append(
        "<question_label>**Câu 50.**</question_label> <stem>Câu hỏi số 50.</stem>\n"
        "- <option_label>A.</option_label> <option_text>Opt A</option_text>\n"
        "<explanation>Lời giải câu 50 bị thiếu thẻ đóng"
    )
    doc_xml = "\n\n".join(blocks)

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(doc_xml, use_llm=False)
    assert report.decision == ReviewDecision.NEEDS_REVISION
    assert not report.is_malfunctioned
    assert report.overall_score >= 85.0
    assert len(report.discard_reasons) == 0


def test_unexpected_closing_tag_moves_to_needs_revision():
    unexpected_xml = """<section># ĐỀ THI</section>
</option_text>
<question_label>**Câu 1.**</question_label> <stem>Nội dung câu hỏi</stem>
- <option_label>A.</option_label> <option_text>A</option_text>
"""
    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(unexpected_xml, use_llm=False)
    assert report.decision == ReviewDecision.NEEDS_REVISION
    assert not report.is_malfunctioned


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


@patch("backend.app.domains.ocr.annotator.reviewer.chat")
def test_review_semantic_includes_raw_ocr_source(mock_chat, valid_xml):
    mock_chat.return_value = json.dumps({
        "score": 92.0,
        "decision": "PASS",
        "is_malfunctioned": False,
        "discard_reasons": [],
        "rubric_scores": {
            "xml_well_formedness": 100.0,
            "schema_conformance": 100.0,
            "verbatim_fidelity": 90.0,
            "sequence_continuity": 100.0,
            "question_option_completeness": 100.0,
            "stimulus_accuracy": 90.0,
        },
        "issues": [],
        "summary": "Omitted lecture text does not affect exam completeness."
    })

    raw_ocr = "### BÀI GIẢNG LÝ THUYẾT DÀI 100 TRANG...\n\n" + valid_xml
    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(valid_xml, raw_ocr_text=raw_ocr, use_llm=True)

    # Verify that raw_ocr_text was included in prompt to chat
    call_args = mock_chat.call_args
    prompt_sent = call_args.kwargs.get("prompt") or call_args[1].get("prompt")
    assert "Original Raw OCR Source Text" in prompt_sent
    assert "BÀI GIẢNG LÝ THUYẾT" in prompt_sent
    assert report.decision == ReviewDecision.PASS


def test_discard_document_and_quarantine(tmp_path, broken_xml_no_questions):
    # Setup test workspace
    input_exam_dir = tmp_path / "sequence_labelling_annotated" / "Math" / "exam_999"
    input_exam_dir.mkdir(parents=True)
    xml_file = input_exam_dir / "merged.xml"
    xml_file.write_text(broken_xml_no_questions, encoding="utf-8")

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


def test_batch_review_flow(tmp_path, valid_xml, broken_xml_unclosed, broken_xml_no_questions):
    annot_base = tmp_path / "annotated"
    exam1 = annot_base / "exam_1"
    exam2 = annot_base / "exam_2"
    exam3 = annot_base / "exam_3"
    exam1.mkdir(parents=True)
    exam2.mkdir(parents=True)
    exam3.mkdir(parents=True)

    (exam1 / "merged.xml").write_text(valid_xml, encoding="utf-8")
    (exam2 / "merged.xml").write_text(broken_xml_unclosed, encoding="utf-8")
    (exam3 / "merged.xml").write_text(broken_xml_no_questions, encoding="utf-8")

    discard_base = tmp_path / "discarded"

    agent = AnnotationReviewerAgent(min_score=75)
    summary = agent.batch_review(
        annotated_dir=annot_base,
        discard_dir=discard_base,
        auto_discard=True,
        use_llm=False,
        concurrency=3,
    )

    assert summary.total_documents == 3
    assert summary.passed_count == 1
    assert summary.needs_revision_count == 1
    assert summary.discarded_count == 1
    assert len(summary.discarded_paths) == 1

    # Check export markdown report
    report_file = tmp_path / "report.md"
    md_content = agent.export_markdown_report(summary, report_file)
    assert "# 📋 Annotation Quality Audit" in md_content
    assert "Passed" in md_content
    assert report_file.exists()


def test_clean_raw_ocr_text_strips_metadata():
    raw_with_meta = """<pages>
<page>
# ĐỀ THI TOÁN
<page_metadata>
{ "p": 1, "seq": [["Q_START", "1"]] }
</page_metadata>
</page>
<page>
Câu 1. Tính giá trị.
<page_metadata>
{ "p": 2 }
</page>
</pages>"""
    cleaned = DeterministicAuditor.clean_raw_ocr_text(raw_with_meta)
    assert "<page_metadata>" not in cleaned
    assert "</page_metadata>" not in cleaned
    assert "<pages>" not in cleaned
    assert "<page>" not in cleaned
    assert "# ĐỀ THI TOÁN" in cleaned
    assert "Câu 1. Tính giá trị." in cleaned


def test_sample_xml_safely_preserves_tag_boundaries():
    blocks = [
        f"<question_label>**Câu {i}.**</question_label>\n<stem>Nội dung câu hỏi số {i} với độ dài văn bản nhất định.</stem>\n<explanation>Lời giải cho câu {i}.</explanation>"
        for i in range(1, 30)
    ]
    xml_doc = "\n\n".join(blocks)
    assert len(xml_doc) > 2000

    sampled = DeepSeekReviewer._sample_xml_safely(xml_doc, max_chars=1000)
    assert "AUDITOR_SAMPLING_WINDOW" in sampled
    assert not sampled.endswith("</")
    assert not sampled.startswith(">")
    assert "<question_label>**Câu 1.**</question_label>" in sampled


def test_stimulus_wrapping_system_tags_auto_reject():
    # Paired stimulus wrapping stem and question_label
    bad_stim_xml = """<section># ĐỀ THI TOÁN</section>
<stimulus id="stim_1">
<question_label>**Câu 1.**</question_label>
<stem>Nội dung câu hỏi bị stimulus bao bọc sai quy tắc.</stem>
- <option_label>A.</option_label> <option_text>1</option_text>
- <option_label>B.</option_label> <option_text>2</option_text>
</stimulus>
"""
    issues, score = DeterministicAuditor.check_stimulus_wrapping_system_tags(bad_stim_xml)
    assert score == 0.0
    assert any(iss.severity == IssueSeverity.CRITICAL for iss in issues)
    assert any("Stimulus tag illegally wraps system tag" in iss.message for iss in issues)

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(bad_stim_xml, use_llm=False)
    assert report.decision == ReviewDecision.DISCARD
    assert report.is_malfunctioned is True
    assert any("STIMULUS_NESTING" in r for r in report.discard_reasons)


def test_isolated_error_in_large_document_passes():
    # 30-question document with 29 perfect questions and 1 isolated question having sub-items in stem
    blocks = []
    for i in range(1, 30):
        blocks.append(
            f"<question_label>**Câu {i}.**</question_label> <stem>Câu hỏi số {i} tiêu chuẩn.</stem>\n"
            f"- <option_label>A.</option_label> <option_text>Đáp án A</option_text>\n"
            f"- <option_label>B.</option_label> <option_text>Đáp án B</option_text>"
        )
    # 30th question has a single un-tagged sub-item in stem
    blocks.append(
        "<question_label>**Câu 30.**</question_label> <stem>Câu hỏi có ý phụ:\n- a) ý thứ nhất</stem>\n"
        "- <option_label>A.</option_label> <option_text>Đáp án A</option_text>\n"
        "- <option_label>B.</option_label> <option_text>Đáp án B</option_text>"
    )
    large_xml = "\n\n".join(blocks)

    issues, q_score, metrics = DeterministicAuditor.check_question_and_option_structure(large_xml)
    assert metrics["questions_count"] == 30
    assert q_score >= 90.0
    # 1 error in 30 questions (3.3%) should be MINOR, not MAJOR
    subitem_issues = [iss for iss in issues if "sub-questions" in iss.message]
    assert len(subitem_issues) == 1
    assert subitem_issues[0].severity == IssueSeverity.MINOR

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(large_xml, use_llm=False)
    assert report.decision == ReviewDecision.PASS
    assert report.overall_score >= 85.0
    assert not report.is_malfunctioned


def test_systemic_major_errors_across_document():
    # 10 questions where 4 have un-tagged sub-items in stem (40% error rate -> systemic MAJOR)
    blocks = []
    for i in range(1, 11):
        if i <= 4:
            blocks.append(
                f"<question_label>**Câu {i}.**</question_label> <stem>Đề bài {i}:\n- a) Ý a\n- b) Ý b</stem>\n"
                f"- <option_label>A.</option_label> <option_text>Opt A</option_text>"
            )
        else:
            blocks.append(
                f"<question_label>**Câu {i}.**</question_label> <stem>Đề bài {i}</stem>\n"
                f"- <option_label>A.</option_label> <option_text>Opt A</option_text>"
            )
    systemic_xml = "\n\n".join(blocks)
    issues, q_score, metrics = DeterministicAuditor.check_question_and_option_structure(systemic_xml)
    subitem_issues = [iss for iss in issues if "sub-questions" in iss.message]
    assert len(subitem_issues) == 1
    assert subitem_issues[0].severity == IssueSeverity.MAJOR


def test_table_html_structure_valid():
    table_xml = """<section># ĐỀ THI HÓA HỌC</section>
<question_label>## Câu 1:</question_label> <stem>Phát biểu sau đúng hay sai?</stem>
<table>
<tr>
<th>Phát biểu</th>
<th>Đúng</th>
<th>Sai</th>
</tr>
<tr>
<td><option_text>Chất chỉ thị màu là chất có màu biến đổi phụ thuộc pH.</option_text></td>
<td>○</td>
<td>○</td>
</tr>
<tr>
<td><option_text>So với thymolphthalein, methyl da cam chuyển màu ở pH cao hơn.</option_text></td>
<td>○</td>
<td>○</td>
</tr>
</table>
"""
    issues, score = DeterministicAuditor.check_xml_syntax(table_xml)
    assert score == 100.0
    assert len(issues) == 0

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(table_xml, use_llm=False)
    assert report.decision == ReviewDecision.PASS
    assert report.overall_score >= 85.0


def test_figures_out_of_scope_no_penalties():
    figure_xml = """<section># ĐỀ THI VẬT LÝ</section>
<question_label>**Câu 1.**</question_label> <stem>Cho mạch điện như hình vẽ: <figure id="fig_1" description="Mạch điện RLC nối tiếp" bbox="100,200,300,400" />. Tính cường độ dòng điện.</stem>
- <option_label>A.</option_label> <option_text>1 A</option_text>
- <option_label>B.</option_label> <option_text>2 A</option_text>
"""
    issues, score = DeterministicAuditor.check_xml_syntax(figure_xml)
    assert score == 100.0
    assert len(issues) == 0

    agent = AnnotationReviewerAgent(min_score=75)
    report = agent.review_document(figure_xml, use_llm=False)
    assert report.decision == ReviewDecision.PASS
    assert report.overall_score >= 90.0


def test_discover_review_targets_merged_vs_chunk_rule(tmp_path):
    # Setup standard exam folder with merged.xml and chunks
    exam1 = tmp_path / "exam_1"
    exam1.mkdir()
    (exam1 / "merged.xml").write_text("<stem>Standard exam</stem>", encoding="utf-8")
    chunks1 = exam1 / "chunks"
    chunks1.mkdir()
    (chunks1 / "chunk_0.xml").write_text("<stem>Standard exam chunk 0</stem>", encoding="utf-8")
    (chunks1 / "chunk_1.xml").write_text("<stem>Standard exam chunk 1</stem>", encoding="utf-8")

    # Setup giant exam folder exceeding 500k tokens
    exam2 = tmp_path / "exam_2"
    exam2.mkdir()
    # Write ~2MB content to exceed 500k tokens
    giant_content = "<stem>" + ("giant text word " * 120_000) + "</stem>"
    (exam2 / "merged.xml").write_text(giant_content, encoding="utf-8")
    chunks2 = exam2 / "chunks"
    chunks2.mkdir()
    (chunks2 / "chunk_0.xml").write_text("<stem>Giant chunk 0</stem>", encoding="utf-8")
    (chunks2 / "chunk_1.xml").write_text("<stem>Giant chunk 1</stem>", encoding="utf-8")

    targets = AnnotationReviewerAgent.discover_review_targets(tmp_path, max_merged_tokens=500_000)
    target_names = [t.name for t in targets]

    # exam_1 is under 500k -> merged.xml selected, chunks ignored
    assert exam1 / "merged.xml" in targets
    assert exam1 / "chunks" / "chunk_0.xml" not in targets
    assert exam1 / "chunks" / "chunk_1.xml" not in targets

    # exam_2 is over 500k -> fallback to chunks, merged.xml ignored
    assert exam2 / "merged.xml" not in targets
    assert exam2 / "chunks" / "chunk_0.xml" in targets
    assert exam2 / "chunks" / "chunk_1.xml" in targets

    # Total targets = 1 (from exam1) + 2 (from exam2) = 3
    assert len(targets) == 3


def test_batch_review_scan_processed_and_resume(tmp_path):
    exam1 = tmp_path / "exam_1"
    exam1.mkdir()
    (exam1 / "merged.xml").write_text("<section># EXAM 1</section><question_label>1.</question_label><stem>Stem 1</stem><option_label>A.</option_label><option_text>Opt 1</option_text>", encoding="utf-8")
    
    exam2 = tmp_path / "exam_2"
    exam2.mkdir()
    (exam2 / "merged.xml").write_text("<section># EXAM 2</section><question_label>1.</question_label><stem>Stem 2</stem><option_label>A.</option_label><option_text>Opt 2</option_text>", encoding="utf-8")

    agent = AnnotationReviewerAgent(min_score=75)
    
    # 1. Initial review: both are processed
    summary1 = agent.batch_review(tmp_path, use_llm=False, overwrite=False)
    assert summary1.total_documents == 2
    assert summary1.passed_count == 2
    assert (exam1 / "audit_report.json").exists()
    assert (exam2 / "audit_report.json").exists()

    # 2. Second review with overwrite=False (resume mode)
    # Mock review_document to ensure it is NOT called for cached files
    with patch.object(agent, "review_document") as mock_rev:
        summary2 = agent.batch_review(tmp_path, use_llm=False, overwrite=False)
        assert summary2.total_documents == 2
        assert summary2.passed_count == 2
        mock_rev.assert_not_called()

    # 3. Third review with overwrite=True
    with patch.object(agent, "review_document", wraps=agent.review_document) as mock_rev:
        summary3 = agent.batch_review(tmp_path, use_llm=False, overwrite=True)
        assert summary3.total_documents == 2
        assert mock_rev.call_count == 2


def test_batch_review_filter_decision(tmp_path):
    exam1 = tmp_path / "exam_1"
    exam1.mkdir()
    (exam1 / "merged.xml").write_text("<section># EXAM 1</section><question_label>1.</question_label><stem>Stem 1</stem><option_label>A.</option_label><option_text>Opt 1</option_text>", encoding="utf-8")
    
    exam2 = tmp_path / "exam_2"
    exam2.mkdir()
    # Empty doc -> DISCARD
    (exam2 / "merged.xml").write_text("", encoding="utf-8")

    agent = AnnotationReviewerAgent(min_score=75)
    summary1 = agent.batch_review(tmp_path, use_llm=False, overwrite=False)
    assert summary1.passed_count == 1
    assert summary1.discarded_count == 1

    # Filter only DISCARD: only exam_2 is re-evaluated, exam_1 is cached
    with patch.object(agent, "review_document", wraps=agent.review_document) as mock_rev:
        summary2 = agent.batch_review(tmp_path, use_llm=False, overwrite=False, filter_decision="DISCARD")
        assert summary2.total_documents == 2
        assert summary2.discarded_count == 1
        # Only exam_2 re-evaluated
        assert mock_rev.call_count == 1




