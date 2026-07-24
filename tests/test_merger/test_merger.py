from pathlib import Path
from xml.etree import ElementTree as ET

from backend.app.services.long_parser.sequence_reconciler import merge_chunk_xmls


def _load_fixture(*parts: str) -> str:
    fixture_root = Path(__file__).resolve().parent / "fixtures"
    return (fixture_root.joinpath(*parts)).read_text(encoding="utf-8").strip()


def _load_raw_inputs(*parts: str):
    root = ET.fromstring(_load_fixture(*parts))
    return [chunk.text.strip() if chunk.text else "" for chunk in root.findall("chunk")]


def _write_merged_output(*parts: str, merged_xml: str) -> None:
    output_root = Path(__file__).resolve().parent / "outputs"
    output_dir = output_root.joinpath(*parts)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "merged_output.xml").write_text(merged_xml, encoding="utf-8")


def test_merge_chunk_xmls_simulates_real_time_overlap_window():
    def make_chunk(start_q, end_q, include_shared_stimulus=False):
        lines = ["<section>Live Stream</section>"]
        if include_shared_stimulus:
            lines.append("<stimulus>Shared passage appears in both chunks.</stimulus>")
        for q in range(start_q, end_q + 1):
            lines.append(f"<question_label>**{q}.**</question_label>")
            lines.append(f"<stem>Question {q} stem.</stem>")
        return lines

    # overlap window: 10, 11, 12 appear in both chunks
    chunk_a = "\n".join(make_chunk(1, 12, include_shared_stimulus=True))
    chunk_b = "\n".join(make_chunk(10, 16, include_shared_stimulus=True))

    result = merge_chunk_xmls([chunk_a, chunk_b])
    merged = result["merged_xml"]

    assert result["total_questions"] == 16
    assert result["deduplicated_count"] == 4
    assert merged.count("<section>Live Stream</section>") == 2
    assert merged.count("<stimulus>Shared passage appears in both chunks.</stimulus>") == 1
    for q in range(1, 17):
        assert merged.count(f"<question_label>**{q}.**</question_label>") == 1


def test_merge_chunk_xmls_skips_hallucinated_question_when_raw_input_missing():
    chunk_1 = """
<question_label>**1.**</question_label>
<stem>First real question.</stem>
<question_label>**2.**</question_label>
<stem>Second real question.</stem>
""".strip()

    chunk_2 = """
<question_label>**2.**</question_label>
<stem>Duplicate in overlap.</stem>
<question_label>**3.**</question_label>
<stem>Hallucinated question should be removed.</stem>
""".strip()

    raw_inputs = [
        "**1.**\n**2.**\n",
        "**2.**\n",
    ]

    result = merge_chunk_xmls([chunk_1, chunk_2], raw_chunk_inputs=raw_inputs)
    merged = result["merged_xml"]

    assert result["total_questions"] == 2
    assert result["deduplicated_count"] == 2
    assert merged.count("<question_label>**1.**</question_label>") == 1
    assert merged.count("<question_label>**2.**</question_label>") == 1
    assert "<question_label>**3.**</question_label>" not in merged


def test_merge_chunk_xmls_real_vietnamese_standardized_exam_overlap_and_overlap_stimulus():
    chunk_a = _load_fixture("vietnamese_math_overlap", "chunk_a.xml")
    chunk_b = _load_fixture("vietnamese_math_overlap", "chunk_b.xml")

    result = merge_chunk_xmls([chunk_a, chunk_b])
    _write_merged_output("vietnamese_math_overlap", merged_xml=result["merged_xml"])

    assert result["total_questions"] == 13
    assert result["deduplicated_count"] == 3
    assert result["question_range"] == "1 - 13"
    assert (
        result["merged_xml"].count(
            "<stimulus>BÀI ĐỌC HIỂU: Một học sinh chuẩn bị đi thi, cần xác định quãng đường đi bộ khi đi từ nhà đến trường trong giờ cao điểm.</stimulus>"
        )
        == 1
    )

    for q in range(1, 14):
        assert result["merged_xml"].count(f"<question_label>**{q}.**</question_label>") == 1


def test_merge_chunk_xmls_real_vietnamese_standardized_exam_prunes_hallucinated_tail():
    chunk_a = _load_fixture("vietnamese_history_hallucinated", "chunk_a.xml")
    chunk_b = _load_fixture("vietnamese_history_hallucinated", "chunk_b.xml")
    raw_chunk_inputs = _load_raw_inputs("vietnamese_history_hallucinated", "raw_inputs.xml")

    result = merge_chunk_xmls([chunk_a, chunk_b], raw_chunk_inputs=raw_chunk_inputs)
    merged = result["merged_xml"]
    _write_merged_output(
        "vietnamese_history_hallucinated",
        merged_xml=merged,
    )

    assert result["total_questions"] == 5
    assert result["question_range"] == "1 - 5"
    assert result["deduplicated_count"] == 1
    assert merged.count("<question_label>**3.**") == 1
    assert merged.count("<question_label>**4.**") == 1
    assert merged.count("<question_label>**5.**") == 1
    assert "<question_label>**6.**" not in merged
