"""
Pruned LLM review payloads for the Azozo Long-Context Parser Engine.

The deterministic pass resolves most of a document on its own. Sending the whole
document to the LLM anyway pays full input price for text that has already been
parsed with certainty, and input is where the money goes once the annotator stops
emitting document text: at $0.14/1M input against $0.28/1M output, a 12k-token
document costs ~$0.0017 to *read* and ~$0.0002 to answer about.

So the payload keeps only what the deterministic pass could not settle --
escalation intervals and unresolved stimulus gaps -- and elides everything else
behind a marker that states how much was removed. The marker matters: without it
the model sees a document full of holes and tries to fill them.

Every retained region carries its absolute character offset, so anchors the model
returns map straight back into the source with no alignment stage.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

#: Characters of context kept on each side of an escalation interval. An
#: escalation is usually a marker the parser could not classify; without its
#: neighbours the model cannot tell a question number from a list bullet.
ESCALATION_CONTEXT = 300

#: Gaps shorter than this are page furniture (headers, "Trang 2/4"), not
#: passages. ``find_stimulus_gaps`` already applies a 200-char floor; this is the
#: stricter floor for what is worth an LLM round trip.
MIN_REVIEW_GAP = 240

#: Two retained regions closer than this are merged rather than emitted with a
#: near-empty elision marker between them.
MERGE_DISTANCE = 120

#: Characters kept from the head of a stimulus gap.
#:
#: The model is only asked where a passage *starts*: its end is the next question
#: marker, which the deterministic pass already located. So the body of a long
#: passage is dead weight in the prompt. Measured start offsets within a gap
#: ranged 0-932 chars (the span consumed by instruction lines and leftover option
#: text), so this leaves substantial margin. Raise it if anchors start coming
#: back unfindable on passage-dense papers.
GAP_HEAD = 1400


@dataclass
class ReviewRegion:
    """One retained span of source text, with its reason for being kept."""

    start: int
    end: int
    kinds: List[str] = field(default_factory=list)
    #: Gap metadata when this region carries an unresolved stimulus candidate.
    gap: Optional[Dict[str, Any]] = None

    @property
    def length(self) -> int:
        return self.end - self.start


@dataclass
class ReviewPayload:
    """The pruned document plus the accounting needed to justify it."""

    text: str
    regions: List[ReviewRegion]
    source_length: int
    retained_length: int
    elided_length: int
    questions_total: int
    questions_elided: int

    @property
    def retention_ratio(self) -> float:
        if not self.source_length:
            return 0.0
        return self.retained_length / self.source_length

    def summary(self) -> Dict[str, Any]:
        return {
            "source_length": self.source_length,
            "payload_length": len(self.text),
            "retained_length": self.retained_length,
            "elided_length": self.elided_length,
            "retention_ratio": round(self.retention_ratio, 4),
            "regions": len(self.regions),
            "questions_total": self.questions_total,
            "questions_elided": self.questions_elided,
        }


def _merge_regions(regions: Sequence[ReviewRegion]) -> List[ReviewRegion]:
    """Coalesce overlapping and near-adjacent regions, unioning their reasons."""
    if not regions:
        return []

    ordered = sorted(regions, key=lambda r: (r.start, r.end))
    merged: List[ReviewRegion] = [
        ReviewRegion(ordered[0].start, ordered[0].end, list(ordered[0].kinds), ordered[0].gap)
    ]

    for region in ordered[1:]:
        last = merged[-1]
        if region.start - last.end <= MERGE_DISTANCE:
            last.end = max(last.end, region.end)
            for kind in region.kinds:
                if kind not in last.kinds:
                    last.kinds.append(kind)
            # A merged region keeps the first gap it carries; a second gap would
            # need its own anchor and is rare enough to accept the imprecision.
            if last.gap is None:
                last.gap = region.gap
        else:
            merged.append(
                ReviewRegion(region.start, region.end, list(region.kinds), region.gap)
            )

    return merged


def collect_review_regions(
    raw_text: str,
    escalation_intervals: Sequence[Tuple[int, int]],
    stimulus_gaps: Sequence[Dict[str, Any]],
    *,
    include_resolved_gaps: bool = False,
) -> List[ReviewRegion]:
    """
    Select the spans of ``raw_text`` that still need an LLM.

    ``include_resolved_gaps`` keeps gaps whose serving range was already read off
    an explicit header ("Questions 131-134 refer to..."); they are excluded by
    default because the header settles the binding without a model call.
    """
    regions: List[ReviewRegion] = []
    limit = len(raw_text)

    for start, end in escalation_intervals:
        lo = max(0, min(limit, start) - ESCALATION_CONTEXT)
        hi = min(limit, max(0, end) + ESCALATION_CONTEXT)
        if hi > lo:
            regions.append(ReviewRegion(lo, hi, ["escalation"]))

    for gap in stimulus_gaps:
        if gap.get("resolved") and not include_resolved_gaps:
            continue
        length = int(gap.get("length") or (gap["end"] - gap["start"]))
        if length < MIN_REVIEW_GAP:
            continue
        lo = max(0, int(gap["start"]))
        hi = min(limit, int(gap["end"]))
        # Only the head is needed to locate the passage start; the tail is
        # reconstructed from the deterministic end boundary.
        hi = min(hi, lo + GAP_HEAD)
        if hi > lo:
            regions.append(ReviewRegion(lo, hi, ["stimulus_gap"], gap=dict(gap)))

    return _merge_regions(regions)


def build_review_payload(
    raw_text: str,
    parse_result: Any,
    *,
    include_resolved_gaps: bool = False,
) -> ReviewPayload:
    """
    Render the pruned document the LLM should actually receive.

    ``parse_result`` is a ``deterministic_parser.ParseResult``. Regions are
    emitted in document order, each headed by its absolute offset, separated by
    a marker naming how much text and how many questions were removed.
    """
    regions = collect_review_regions(
        raw_text,
        getattr(parse_result, "escalation_intervals", []) or [],
        getattr(parse_result, "stimulus_gaps", []) or [],
        include_resolved_gaps=include_resolved_gaps,
    )

    spans = getattr(parse_result, "spans", []) or []
    question_starts = [s["start"] for s in spans if s.get("label") == "question_label"]

    def questions_in(lo: int, hi: int) -> int:
        return sum(1 for start in question_starts if lo <= start < hi)

    chunks: List[str] = []
    cursor = 0
    retained = 0
    elided = 0
    elided_questions = 0

    for region in regions:
        if region.start > cursor:
            skipped = region.start - cursor
            elided += skipped
            n_questions = questions_in(cursor, region.start)
            elided_questions += n_questions
            chunks.append(_elision_marker(cursor, region.start, n_questions))

        header = f"[offset {region.start}] ({', '.join(region.kinds)})"
        chunks.append(f"{header}\n{raw_text[region.start:region.end]}")
        retained += region.length
        cursor = max(cursor, region.end)

    if cursor < len(raw_text):
        skipped = len(raw_text) - cursor
        elided += skipped
        n_questions = questions_in(cursor, len(raw_text))
        elided_questions += n_questions
        chunks.append(_elision_marker(cursor, len(raw_text), n_questions))

    return ReviewPayload(
        text="\n\n".join(chunks),
        regions=regions,
        source_length=len(raw_text),
        retained_length=retained,
        elided_length=elided,
        questions_total=len(question_starts),
        questions_elided=elided_questions,
    )


def _elision_marker(start: int, end: int, questions: int) -> str:
    """State what was removed, so the model does not read a hole as missing data."""
    detail = f"{end - start} chars"
    if questions:
        detail += f", {questions} question{'s' if questions != 1 else ''} already parsed"
    return f"[offset {start}-{end} elided: {detail}]"
