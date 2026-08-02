"""
Tests for the deterministic exam-structure parser.

The regression suite at the bottom scores against the LLM-annotated chunks in
tests/parser_visualize/results/, which is the only ground truth available. Note
that the reference is imperfect for ``stem`` (it left 40 of 207 questions
untagged), so stem agreement is asserted loosely on purpose.
"""

import re
from pathlib import Path

import pytest

from backend.app.domains.ocr.parser.long_parser.deterministic_parser import (
    CONFIDENCE_ESCALATION_THRESHOLD,
    Signature,
    build_mask,
    enforce_run_coherence,
    extract_answer_key,
    harvest_candidates,
    induce_grammar,
    parse_chunk_deterministic,
    spans_to_annotated_xml,
)

REPO_ROOT = Path(__file__).resolve().parents[4]
GOLD_DIRS = [
    REPO_ROOT
    / "tests/parser_visualize/results"
    / "ocr_de-va-dap-an-chinh-thuc-ky-thi-tot-nghiep-thpt-nam-2025-mon-tieng-anh_20260724_152559",
    REPO_ROOT / "tests/parser_visualize/results/ocr_input_20260722_222013",
]

FOUR_OPTION_MCQ = (
    "**1.** First question stem here.\n"
    "A. alpha\nB. bravo\nC. charlie\nD. delta\n\n"
    "**2.** Second question stem here.\n"
    "A. alpha\nB. bravo\nC. charlie\nD. delta\n\n"
    "**3.** Third question stem here.\n"
    "A. alpha\nB. bravo\nC. charlie\nD. delta\n"
)


# ── Stage 0: masking ──────────────────────────────────────────────────────────


def test_mask_covers_latex_and_preserves_length():
    text = "before $A. B = 0$ after"
    mask = build_mask(text)
    assert len(mask) == len(text)
    assert mask[text.index("$A.")] == 1
    assert mask[0] == 0


def test_enumerators_inside_latex_are_not_harvested():
    text = "**1.** Cho $A. B = 0$ va $(1) x$.\nA. one\nB. two\nC. three\nD. four\n"
    candidates = harvest_candidates(text, build_mask(text))
    latex_start = text.index("$A.")
    latex_end = text.index("$.\n") if "$.\n" in text else len(text)
    assert not [c for c in candidates if latex_start < c.start < latex_end]


# ── Stage 1: harvest ──────────────────────────────────────────────────────────


def test_bare_numbers_in_prose_are_not_candidates():
    text = "The 3 pillars of reform are clear and 5 percent agreed."
    assert harvest_candidates(text, build_mask(text)) == []


def test_ambiguous_ordinal_yields_multiple_readings():
    """'I.' is both upper_alpha and upper_roman until later stages decide."""
    text = "I. first\nII. second\n"
    systems = {c.signature.numeral for c in harvest_candidates(text, build_mask(text))}
    assert "upper_roman" in systems


# ── Stage 2: induction ────────────────────────────────────────────────────────


def test_induces_bold_arabic_questions_and_alpha_options():
    text = FOUR_OPTION_MCQ
    grammar = induce_grammar(harvest_candidates(text, build_mask(text)), (0, len(text)))
    assert grammar.question == Signature("**", "", "arabic", "", ".")
    assert grammar.option == Signature("", "", "upper_alpha", "", ".")
    assert grammar.option_mode == 4


def test_induces_vietnamese_colon_convention():
    text = "".join(
        f"Câu {n}: Noi dung cau hoi.\nA. mot\nB. hai\nC. ba\nD. bon\n\n"
        for n in (1, 2, 3)
    )
    grammar = induce_grammar(harvest_candidates(text, build_mask(text)), (0, len(text)))
    assert grammar.question == Signature("", "câu", "arabic", "", ":")
    assert grammar.option_mode == 4


def test_signature_ignores_line_position_so_wrapped_runs_survive():
    """Two-options-per-line layouts must stay one class, not split in half."""
    text = "".join(
        f"**{n}.** Stem text.\nA. alpha B. bravo\nC. charlie D. delta\n\n"
        for n in (1, 2, 3)
    )
    result = parse_chunk_deterministic(text)
    assert result.diagnostics["option_mode"] == 4
    assert result.diagnostics["options_found"] == 12


def test_sparse_prose_decimals_rejected_by_density_gate():
    """A class spanning 1..900 with a handful of hits is prose, not structure."""
    text = (
        "Revenue rose 5. Costs fell 40. Margin hit 900.\n" * 3
    ) + FOUR_OPTION_MCQ
    grammar = induce_grammar(harvest_candidates(text, build_mask(text)), (0, len(text)))
    assert grammar.question == Signature("**", "", "arabic", "", ".")


# ── Stage 3: run coherence and repair ─────────────────────────────────────────


def test_run_coherence_rejects_orphan_label():
    """'mark the letter (A), (B), (C), or (D)' must not become options."""
    text = (
        "Directions: mark the letter (A), (B), (C), or (D) on your answer sheet.\n\n"
        + FOUR_OPTION_MCQ
    )
    result = parse_chunk_deterministic(text)
    directions_end = text.index("\n\n")
    assert not [
        s
        for s in result.spans
        if s["label"] == "option_label" and s["start"] < directions_end
    ]
    assert result.diagnostics["options_found"] == 12


def test_run_coherence_keeps_only_runs_starting_at_first_ordinal():
    from backend.app.domains.ocr.parser.long_parser.deterministic_parser import Candidate

    sig = Signature("", "", "upper_alpha", "", ".")
    cands = [
        Candidate(0, 2, sig, 4, "D."),          # orphan
        Candidate(10, 12, sig, 1, "A."),
        Candidate(20, 22, sig, 2, "B."),
    ]
    kept = enforce_run_coherence(cands)
    assert [c.ordinal for c in kept] == [1, 2]


def test_missing_ordinal_is_reported_and_forces_review():
    """A hole in the middle of an otherwise clean run must be detected."""
    blocks = [
        f"**{n}.** Stem number {n} here.\nA. alpha\nB. bravo\nC. charlie\nD. delta\n\n"
        for n in range(1, 9)
        if n != 4
    ]
    result = parse_chunk_deterministic("".join(blocks))
    assert result.unresolved_ordinals == [4]
    assert result.needs_llm_review


def test_repair_is_bounded_and_does_not_blow_up():
    """A wrong grammar must escalate, not trigger an unbounded rescan."""
    text = "\n".join(f"**{n * 97}.** stem {n}" for n in range(1, 40))
    result = parse_chunk_deterministic(text)
    assert result.needs_llm_review


# ── Stage 4: derivation ───────────────────────────────────────────────────────


def test_stem_and_option_text_derived_by_subtraction():
    result = parse_chunk_deterministic(FOUR_OPTION_MCQ)
    stems = [s for s in result.spans if s["label"] == "stem"]
    assert len(stems) == 3
    assert stems[0]["text"] == "First question stem here."
    texts = [s["text"] for s in result.spans if s["label"] == "option_text"]
    assert texts[:4] == ["alpha", "bravo", "charlie", "delta"]


def test_spans_are_sorted_and_within_bounds():
    result = parse_chunk_deterministic(FOUR_OPTION_MCQ)
    starts = [s["start"] for s in result.spans]
    assert starts == sorted(starts)
    for span in result.spans:
        assert 0 <= span["start"] < span["end"] <= len(FOUR_OPTION_MCQ)
        assert span["text"] == FOUR_OPTION_MCQ[span["start"]:span["end"]]


def test_questions_without_options_still_parse():
    """Essay / short-answer papers have no option enumerator to induce."""
    text = "".join(f"**Câu {n}.** Giai bai toan sau day.\n\n" for n in (1, 2, 3, 4))
    result = parse_chunk_deterministic(text)
    assert result.diagnostics["questions_found"] == 4
    assert result.diagnostics["options_found"] == 0
    assert not result.needs_llm_review


# ── Stage 6 and confidence ────────────────────────────────────────────────────


def test_answer_key_binds_to_ordinals():
    text = FOUR_OPTION_MCQ + "\nANSWERS\n1. B  2. C  3. A\n"
    result = parse_chunk_deterministic(text)
    assert result.answer_key == {"1": "B", "2": "C", "3": "A"}


def test_prose_after_questions_is_not_mistaken_for_a_key():
    text = FOUR_OPTION_MCQ + (
        "\nThe examiner should collect all papers. 1. Please ensure that every "
        "candidate has written their name legibly on the front cover sheet.\n"
    )
    assert extract_answer_key(text, []) == {}


@pytest.mark.parametrize("text", ["", "   \n\n  ", "Just some prose with no structure."])
def test_degenerate_input_escalates_without_crashing(text):
    result = parse_chunk_deterministic(text)
    assert result.spans == []
    assert result.confidence == 0.0
    assert result.needs_llm_review


def test_zero_options_never_reports_high_confidence():
    """An option grammar that yields nothing must not look uniform."""
    text = "".join(f"**{n}.** stem only, no choices at all here.\n\n" for n in range(1, 9))
    result = parse_chunk_deterministic(text)
    if result.diagnostics.get("options_found", 0) == 0:
        assert result.diagnostics.get("option_uniformity", 0.0) == 0.0


def test_duplicate_ordinals_force_review():
    """An exam bundled with its own answer key repeats every ordinal."""
    result = parse_chunk_deterministic(FOUR_OPTION_MCQ + FOUR_OPTION_MCQ)
    assert result.diagnostics["duplicate_ordinals"] > 0
    assert result.needs_llm_review


# ── Serialisation ─────────────────────────────────────────────────────────────


def test_xml_round_trip_is_lossless():
    """Tags are inserted into the source, so the text cannot drift."""
    result = parse_chunk_deterministic(FOUR_OPTION_MCQ)
    xml = spans_to_annotated_xml(FOUR_OPTION_MCQ, result.spans)
    stripped = re.sub(r"</?[a-z_]+>", "", xml)
    assert stripped == FOUR_OPTION_MCQ


# ── Regression against the LLM-annotated corpus ───────────────────────────────


def _gold_chunks():
    for directory in GOLD_DIRS:
        for path in sorted(directory.glob("*_parsed.xml")):
            yield path


@pytest.mark.skipif(
    not any(d.exists() for d in GOLD_DIRS), reason="gold corpus not present"
)
def test_matches_llm_annotation_on_gold_corpus():
    from backend.app.domains.ocr.annotator.annotate_ocr import parse_xml_annotations

    totals = {label: [0, 0, 0] for label in ("question_label", "option_label")}

    for path in _gold_chunks():
        raw, gold_spans = parse_xml_annotations(path.read_text(encoding="utf-8"))
        result = parse_chunk_deterministic(raw)

        for label in totals:
            gold = {s["start"] for s in gold_spans if s["label"] == label}
            hits = [s["start"] for s in result.spans if s["label"] == label]
            matched = set()
            false_positives = 0
            for hit in hits:
                found = next((g for g in gold if abs(g - hit) <= 4), None)
                if found is None:
                    false_positives += 1
                else:
                    matched.add(found)
            totals[label][0] += len(matched)
            totals[label][1] += false_positives
            totals[label][2] += len(gold) - len(matched)

    # Exact agreement with the LLM on both marker classes.
    assert totals["question_label"] == [207, 0, 0], totals["question_label"]
    assert totals["option_label"] == [828, 0, 0], totals["option_label"]


@pytest.mark.skipif(
    not any(d.exists() for d in GOLD_DIRS), reason="gold corpus not present"
)
def test_gold_corpus_parses_at_full_confidence():
    from backend.app.domains.ocr.annotator.annotate_ocr import parse_xml_annotations

    for path in _gold_chunks():
        raw, _ = parse_xml_annotations(path.read_text(encoding="utf-8"))
        result = parse_chunk_deterministic(raw)
        assert result.confidence >= CONFIDENCE_ESCALATION_THRESHOLD, path.name
        assert not result.needs_llm_review, path.name
