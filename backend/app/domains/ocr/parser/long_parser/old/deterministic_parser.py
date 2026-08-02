"""
Deterministic exam-structure parser for the Azozo Long-Context Parser Engine.

Replaces the per-chunk LLM sequence-annotation call for the *structural* tags
(question_label, option_label, stem, option_text) with an O(L) deterministic
pass. Emits spans in exactly the schema produced by
``annotate_ocr.parse_xml_annotations`` so it is a drop-in substitute upstream of
``parser.parse_spans_into_structured_questions``.

Design principle: induce the document's enumeration convention rather than
enumerating known conventions. Exam papers vary unboundedly in how they mark a
question ("Câu 1:", "**101.**", "Question 19.", "Bài 3.", "1)") but each paper
is rigidly self-consistent, so the convention is recoverable from internal
statistics. Question and option hypotheses validate each other: options restart
exactly once per question, which is a falsifiable test rather than a heuristic.

Stages
    0. Offset-preserving masking of regions where enumerators are literal
       (LaTeX, HTML tables, code, page markers).
    1. Permissive candidate harvest -- one generic shape, no role knowledge.
    2. Role induction over signature classes via mutual constraint + MDL.
    3. Validation, deterministic repair, and per-interval escalation flags.
    4. Structural derivation (stem/option_text are arithmetic on the lattice).
    5. Stimulus gap identification (deterministic headers; rest deferred to LLM).
    6. Answer-key binding.

The module has no LLM dependency and is importable standalone.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

# ── Tunables ──────────────────────────────────────────────────────────────────

#: Minimum instances for a signature class to be considered a role candidate.
MIN_CLASS_SIZE = 3

#: Weights for the role-induction objective (see ``_score_pair``).
W_Q_ASCENDING = 2.0
W_O_ASCENDING = 1.0
W_NESTING = 2.0
#: Fraction of questions owning a coherent option run -- the mutual constraint.
W_ATTACHMENT = 3.0
W_OPTION_REGULARITY = 0.5
W_COVERAGE = 3.0
W_OPTION_UNIFORMITY = 2.0
W_Q_DENSITY = 1.5
W_Q_RESET_PENALTY = 1.5

#: A question class whose ordinals are sparser than this is prose, not structure.
MIN_QUESTION_DENSITY = 0.5

#: Gap repair is bounded so a wrong grammar cannot trigger a quadratic rescan.
#: Exceeding either bound means the grammar is wrong, not that the document has
#: that many holes -- the right response is to escalate, not to search harder.
MAX_REPAIR_ABSOLUTE = 64
MAX_REPAIR_RATIO = 0.5

#: Confidence below which a chunk should be escalated to the LLM annotator.
CONFIDENCE_ESCALATION_THRESHOLD = 0.75

#: Share of repeated ordinals above which the whole chunk is escalated.
#: Multi-part papers legitimately reuse numbers across parts, so a few repeats
#: only lower confidence; a large share means the document (or a page overlap)
#: was duplicated wholesale and ordinal-keyed merging can no longer be trusted.
DUPLICATE_REVIEW_RATIO = 0.25

#: Offset tolerance when reconciling repaired markers against existing ones.
MARKER_DEDUPE_TOLERANCE = 4

#: A section marker must appear within this many chars before an ordinal reset.
SECTION_ALIGNMENT_WINDOW = 600

#: Minimum fraction of ordinal resets a section class must explain.
SECTION_ALIGNMENT_MIN = 0.8

#: Partitioning must beat the global grammar by this margin to be accepted.
SECTION_SPLIT_MIN_GAIN = 0.05

ROMAN_VALUES = {
    "i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6,
    "vii": 7, "viii": 8, "ix": 9, "x": 10, "xi": 11, "xii": 12,
}

SECTION_KEYWORDS = {"part", "phần", "section", "exercise"}

#: Regions where an enumerator-looking token is literal text, not structure.
MASK_PATTERNS: Tuple[str, ...] = (
    r"\$\$.*?\$\$",
    r"\$[^\$\n]*\$",
    r"<table\b.*?</table>",
    r"`[^`\n]*`",
    r"<\|page\|>Page \d+",
    r"!\[[^\]]*\]\([^)]*\)",
)

#: One generic enumerator shape. Roles are assigned later, never here.
CANDIDATE_RE = re.compile(
    # An enumerator must begin at a line start or after whitespace. Without this
    # boundary the lexer fires inside words -- "agreed." yields a spurious "d."
    # option -- and such noise is only accidentally filtered downstream.
    r"(?P<lead>(?:^|(?<=[ \t\n]))[ \t]*(?:[-*+][ \t]+)?)"
    r"(?P<decor_l>\*\*|__)?"
    r"(?:(?P<keyword>Question|Câu|Bài|Part|PHẦN|Phần|PART|Section|Exercise)[ \t]*)?"
    r"(?P<bra>[(\[])?"
    r"(?P<ord>\d{1,4}|[A-Za-z]|[IVXivx]{2,4})"
    r"(?P<ket>[)\]])?"
    r"(?P<term>[.:)\-]|)"
    r"(?P<decor_r>\*\*|__)?"
    r"(?=[ \t\n]|\*\*|$)",
    re.MULTILINE,
)

#: Deterministic stimulus headers, e.g. "Questions 131-134 refer to the ...".
#: Header binding a passage to the ordinals it serves.
#:
#: Two phrasings occur. Compact ("Questions 131-134 refer to...") puts the range
#: next to the keyword. Rubric-style instruction lines, which is what national
#: exam papers use, separate them ("...to each of the following questions from 19
#: to 28", "...the numbered blanks from 1 to 5"), so the optional ``from`` and the
#: blank keyword are both required to match real papers. A gap that matches has
#: its ordinal binding settled without an LLM call, and the passage starts where
#: the instruction line ends.
STIMULUS_HEADER_RE = re.compile(
    r"(?:Questions?|Câu|blanks?)\s+(?:from\s+)?(\d{1,4})\s*(?:[-–—]|to|đến)\s*(\d{1,4})",
    re.IGNORECASE,
)

#: Answer-key entry: ordinal then a bare letter, e.g. "101. B" or "1-A".
ANSWER_KEY_ENTRY_RE = re.compile(
    r"(?<![\w])(\d{1,4})\s*[.):\-–]\s*(?:\*\*)?([A-Da-d])(?:\*\*)?(?![\w])"
)


# ── Data model ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Signature:
    """
    The surface *style* of an enumerator, independent of its value.

    Deliberately excludes line position. Papers routinely mix line-initial and
    inline placement inside a single option run -- two-options-per-line layouts
    ("A. randomly deployed B. legally regulated") and four-on-one-line layouts
    are both common. Making position part of the identity shatters such a class
    in half and destroys the very regularity induction depends on. Position is
    retained on ``Candidate`` for the section heuristic, and the discrimination
    that position would have provided comes from nesting plus run coherence.
    """

    decor: str
    keyword: str
    numeral: str
    bracket: str
    terminator: str

    def describe(self) -> str:
        parts = []
        if self.decor:
            parts.append(self.decor)
        if self.keyword:
            parts.append(self.keyword.capitalize())
        token = {"arabic": "N", "upper_alpha": "A", "lower_alpha": "a",
                 "upper_roman": "I", "lower_roman": "i"}[self.numeral]
        # The bracket may be half-open ("(A" with no closing paren).
        if len(self.bracket) == 2:
            token = self.bracket[0] + token + self.bracket[1]
        elif self.bracket:
            token = self.bracket + token
        parts.append(token + self.terminator)
        if self.decor:
            parts.append(self.decor)
        return "".join(parts)


@dataclass
class Candidate:
    """A harvested enumerator occurrence, pre-role-assignment."""

    start: int
    end: int
    signature: Signature
    ordinal: int
    surface: str
    line_pos: str = "line_initial"


@dataclass
class ClassStats:
    n: int
    ascending: float
    resets: int
    median_delta: float
    delta_cv: float
    first_ordinal: int
    span: Tuple[int, int]
    #: n / (max_ordinal - min_ordinal + 1). A real question enumerator is dense:
    #: it hits nearly every ordinal in its range. Prose decimals scattered across
    #: a document produce a huge sparse range instead, and this is what exposes
    #: them before they can win induction.
    density: float = 0.0


@dataclass
class Grammar:
    """The enumeration convention induced for one document region."""

    question: Optional[Signature] = None
    option: Optional[Signature] = None
    section: Optional[Signature] = None
    option_mode: int = 0
    score: float = 0.0
    margin: float = 0.0
    region: Tuple[int, int] = (0, 0)

    def describe(self) -> Dict[str, Any]:
        return {
            "question": self.question.describe() if self.question else None,
            "option": self.option.describe() if self.option else None,
            "section": self.section.describe() if self.section else None,
            "option_mode": self.option_mode,
            "score": round(self.score, 3),
            "margin": round(self.margin, 3),
            "region": list(self.region),
        }


@dataclass
class ParseResult:
    """Everything the pipeline needs, plus the honesty signals."""

    spans: List[Dict[str, Any]] = field(default_factory=list)
    grammars: List[Grammar] = field(default_factory=list)
    confidence: float = 0.0
    diagnostics: Dict[str, Any] = field(default_factory=dict)
    #: Character intervals the deterministic pass could not resolve.
    escalation_intervals: List[Tuple[int, int]] = field(default_factory=list)
    #: Unclaimed text runs that are stimulus candidates.
    stimulus_gaps: List[Dict[str, Any]] = field(default_factory=list)
    answer_key: Dict[str, str] = field(default_factory=dict)
    #: Ordinals known to exist but whose marker could not be located.
    unresolved_ordinals: List[int] = field(default_factory=list)

    @property
    def needs_llm_review(self) -> bool:
        """
        Whether this parse must be checked by the LLM annotator.

        Each condition is independently disqualifying. A scalar threshold alone
        is not enough: a document can score well overall while still having
        located questions it knows are missing, and shipping that silently is
        exactly the failure this contract exists to prevent.
        """
        found = max(1, self.diagnostics.get("questions_found", 0))
        duplicate_ratio = self.diagnostics.get("duplicate_ordinals", 0) / found
        return (
            self.confidence < CONFIDENCE_ESCALATION_THRESHOLD
            or bool(self.escalation_intervals)
            or bool(self.unresolved_ordinals)
            or duplicate_ratio > DUPLICATE_REVIEW_RATIO
        )


# ── Stage 0: offset-preserving masking ────────────────────────────────────────


def build_mask(text: str) -> bytearray:
    """
    Mark bytes belonging to regions where enumerators are literal.

    A parallel mask is used rather than string substitution so every downstream
    offset indexes the original text exactly -- span fidelity depends on it.
    """
    mask = bytearray(len(text))
    for pattern in MASK_PATTERNS:
        for match in re.finditer(pattern, text, re.DOTALL | re.IGNORECASE):
            for idx in range(match.start(), match.end()):
                mask[idx] = 1
    return mask


# ── Stage 1: permissive candidate harvest ─────────────────────────────────────


def _interpret_ordinal(token: str) -> List[Tuple[str, int]]:
    """
    Return every plausible (numeral_system, value) reading of an ordinal token.

    Ambiguity (is "I" alpha or roman?) is deliberately preserved; run coherence
    in later stages discards the losing interpretation.
    """
    readings: List[Tuple[str, int]] = []
    if token.isdigit():
        readings.append(("arabic", int(token)))
    if len(token) == 1 and token.isalpha():
        if token.isupper():
            readings.append(("upper_alpha", ord(token) - 64))
        else:
            readings.append(("lower_alpha", ord(token) - 96))
    lowered = token.lower()
    if lowered in ROMAN_VALUES:
        system = "upper_roman" if token.isupper() else "lower_roman"
        readings.append((system, ROMAN_VALUES[lowered]))
    return readings


def _line_start_index(text: str, offset: int) -> int:
    newline = text.rfind("\n", 0, offset)
    return 0 if newline == -1 else newline + 1


def harvest_candidates(text: str, mask: Sequence[int]) -> List[Candidate]:
    """Over-generate enumerator candidates. No role decisions are made here."""
    candidates: List[Candidate] = []

    for match in CANDIDATE_RE.finditer(text):
        # A bare token with neither terminator nor bracket is prose, not an
        # enumerator ("the 3 pillars" must not become question 3).
        if not (match.group("term") or match.group("ket")):
            continue

        # Anchor the span at the first structural character, not at the
        # leading whitespace the regex consumed.
        for group in ("decor_l", "keyword", "bra", "ord"):
            if match.group(group) is not None:
                start = match.start(group)
                break
        else:  # pragma: no cover - 'ord' always matches
            continue

        if mask[start]:
            continue

        line_start = _line_start_index(text, start)
        prefix = text[line_start:start]
        line_pos = "line_initial" if re.fullmatch(r"[ \t]*(?:[-*+][ \t]+)?", prefix) else "inline"

        for numeral, value in _interpret_ordinal(match.group("ord")):
            signature = Signature(
                decor=match.group("decor_l") or "",
                keyword=(match.group("keyword") or "").lower(),
                numeral=numeral,
                bracket=(match.group("bra") or "") + (match.group("ket") or ""),
                terminator=match.group("term") or "",
            )
            candidates.append(
                Candidate(
                    start=start,
                    end=match.end(),
                    signature=signature,
                    ordinal=value,
                    surface=match.group(0).strip(),
                    line_pos=line_pos,
                )
            )

    return candidates


# ── Stage 2: role induction ───────────────────────────────────────────────────


def _class_stats(instances: Sequence[Candidate]) -> Optional[ClassStats]:
    n = len(instances)
    if n < 2:
        return None

    offsets = [c.start for c in instances]
    ordinals = [c.ordinal for c in instances]
    deltas = [b - a for a, b in zip(offsets, offsets[1:])]

    ascending = sum(1 for a, b in zip(ordinals, ordinals[1:]) if b == a + 1) / (n - 1)
    resets = sum(1 for a, b in zip(ordinals, ordinals[1:]) if b <= a)
    mean_delta = statistics.fmean(deltas)
    cv = (statistics.stdev(deltas) / mean_delta) if n > 2 and mean_delta else 0.0

    ordinal_range = max(ordinals) - min(ordinals) + 1

    return ClassStats(
        n=n,
        ascending=ascending,
        resets=resets,
        median_delta=statistics.median(deltas),
        delta_cv=cv,
        first_ordinal=ordinals[0],
        span=(offsets[0], offsets[-1]),
        density=len(set(ordinals)) / max(1, ordinal_range),
    )


def _group_by_signature(
    candidates: Iterable[Candidate],
) -> Dict[Signature, List[Candidate]]:
    grouped: Dict[Signature, List[Candidate]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate.signature, []).append(candidate)
    for instances in grouped.values():
        instances.sort(key=lambda c: c.start)
    return grouped


def _question_bounds(questions: Sequence[Candidate], region_end: int) -> List[int]:
    return [q.start for q in questions] + [region_end + 1]


def _nesting_fraction(
    options: Sequence[Candidate], questions: Sequence[Candidate], region_end: int
) -> float:
    """Fraction of option instances that fall inside some question interval."""
    if not options or not questions:
        return 0.0
    bounds = _question_bounds(questions, region_end)
    inside = 0
    for option in options:
        for lo, hi in zip(bounds, bounds[1:]):
            if lo < option.start < hi:
                inside += 1
                break
    return inside / len(options)


def _options_per_question(
    options: Sequence[Candidate], questions: Sequence[Candidate], region_end: int
) -> List[int]:
    bounds = _question_bounds(questions, region_end)
    starts = [o.start for o in options]
    return [
        sum(1 for s in starts if lo < s < hi)
        for lo, hi in zip(bounds, bounds[1:])
    ]


def _uniformity(counts: Sequence[int]) -> Tuple[float, int]:
    """
    Mode share of per-question option counts. Real MCQ grammars are rigid.

    A mode of zero scores zero rather than one. An all-zero count vector is
    perfectly "uniform" in the naive sense, which would let a grammar that
    nominated an option enumerator yielding no options at all report full
    confidence -- a silently wrong parse, the one outcome this module must never
    produce.
    """
    if not counts:
        return 0.0, 0
    mode = statistics.mode(counts)
    if mode == 0:
        return 0.0, 0
    return counts.count(mode) / len(counts), mode


def _score_pair(
    q_instances: Sequence[Candidate],
    q_stats: ClassStats,
    o_instances: Sequence[Candidate],
    o_stats: ClassStats,
    region: Tuple[int, int],
) -> Optional[Tuple[float, int]]:
    """
    Score a (question, option) role hypothesis. Returns (score, option_mode).

    The load-bearing term is *attachment*: the fraction of questions that own a
    coherent option run. That is the mutual constraint tying the two hypotheses
    together, and it is measured on exactly the nested, run-coherent option set
    the derivation stage will later use -- so scoring cannot approve a grammar
    that then yields nothing.

    An earlier formulation compared global ``resets(O) + 1`` against ``|Q|`` on
    the theory that options restart once per question. That breaks on any
    document repeating its option runs (answer keys, worked explanations), where
    resets becomes a multiple of the question count and the term collapses to
    zero, letting an unrelated class win. Counting per-question attachment is
    immune to trailing and duplicated material.

    Coverage, density and uniformity are MDL-style terms preferring the grammar
    that explains the most text -- without them a small local enumeration can
    outscore the document-wide convention.
    """
    region_start, region_end = region
    region_len = max(1, region_end - region_start)

    # Hard structural gates.
    if o_stats.n <= q_stats.n:
        return None
    if q_stats.median_delta <= o_stats.median_delta:
        return None
    if q_stats.density < MIN_QUESTION_DENSITY:
        return None  # Sparse ordinal range: prose decimals, not an enumerator.

    # Measure on the same option set the derivation will consume.
    bounds = _question_bounds(q_instances, region_end)
    nested = [
        o
        for o in o_instances
        if any(lo < o.start < hi for lo, hi in zip(bounds, bounds[1:]))
    ]
    if not nested:
        return None
    coherent = enforce_run_coherence(nested)
    if not coherent:
        return None

    counts = _options_per_question(coherent, q_instances, region_end)
    attachment = sum(1 for c in counts if c >= 2) / max(1, len(counts))
    nesting = len(nested) / max(1, o_stats.n)
    coverage = (q_stats.span[1] - q_stats.span[0]) / region_len
    uniformity, mode = _uniformity(counts)

    score = (
        W_Q_ASCENDING * q_stats.ascending
        + W_O_ASCENDING * o_stats.ascending
        + W_NESTING * nesting
        + W_ATTACHMENT * attachment
        + W_OPTION_REGULARITY * (1.0 - min(1.0, o_stats.delta_cv))
        + W_COVERAGE * min(1.0, coverage)
        + W_OPTION_UNIFORMITY * uniformity
        + W_Q_DENSITY * q_stats.density
        - W_Q_RESET_PENALTY * (q_stats.resets / max(1, q_stats.n))
    )
    return score, mode


def induce_grammar(
    candidates: Sequence[Candidate], region: Tuple[int, int]
) -> Grammar:
    """Select the (question, option) signature pair that best explains a region."""
    grouped = _group_by_signature(candidates)
    stats = {sig: _class_stats(inst) for sig, inst in grouped.items()}
    viable = {
        sig: st for sig, st in stats.items() if st and st.n >= MIN_CLASS_SIZE
    }

    scored: List[Tuple[float, Signature, Signature, int]] = []
    for q_sig, q_stats in viable.items():
        for o_sig, o_stats in viable.items():
            if q_sig == o_sig:
                continue
            outcome = _score_pair(
                grouped[q_sig], q_stats, grouped[o_sig], o_stats, region
            )
            if outcome is None:
                continue
            score, mode = outcome
            scored.append((score, q_sig, o_sig, mode))

    if scored:
        scored.sort(key=lambda item: item[0], reverse=True)
        best = scored[0]
        runner_up = scored[1][0] if len(scored) > 1 else 0.0
        return Grammar(
            question=best[1],
            option=best[2],
            option_mode=best[3],
            score=best[0],
            margin=best[0] - runner_up,
            region=region,
        )

    return _induce_question_only(grouped, viable, region)


def _induce_question_only(
    grouped: Dict[Signature, List[Candidate]],
    viable: Dict[Signature, ClassStats],
    region: Tuple[int, int],
) -> Grammar:
    """
    Fall back to a question-only grammar when no option enumerator exists.

    Essay, short-answer and constructed-response papers (e.g. THPT PHẦN III)
    have numbered questions with nothing to choose from. Without this the whole
    region would escalate to the LLM despite being perfectly regular.
    """
    region_start, region_end = region
    region_len = max(1, region_end - region_start)

    ranked: List[Tuple[float, Signature]] = []
    for signature, stats in viable.items():
        if stats.ascending < 0.6:
            continue
        coverage = (stats.span[1] - stats.span[0]) / region_len
        score = (
            W_Q_ASCENDING * stats.ascending
            + W_COVERAGE * min(1.0, coverage)
            - W_Q_RESET_PENALTY * (stats.resets / max(1, stats.n))
        )
        ranked.append((score, signature))

    if not ranked:
        return Grammar(region=region)

    ranked.sort(key=lambda item: item[0], reverse=True)
    runner_up = ranked[1][0] if len(ranked) > 1 else 0.0
    return Grammar(
        question=ranked[0][1],
        option=None,
        option_mode=0,
        score=ranked[0][0],
        margin=ranked[0][0] - runner_up,
        region=region,
    )


def induce_section_signature(
    candidates: Sequence[Candidate], question_instances: Sequence[Candidate]
) -> Optional[Signature]:
    """
    Find the section enumerator, if any.

    A section class is small, keyword-bearing or roman, and -- the decisive
    test -- its instances coincide with the points where question ordinals
    reset. That makes it self-verifying against the question hypothesis.
    """
    if not question_instances:
        return None

    reset_offsets = [
        b.start
        for a, b in zip(question_instances, question_instances[1:])
        if b.ordinal <= a.ordinal
    ]

    grouped = _group_by_signature(candidates)
    best: Optional[Tuple[float, Signature]] = None

    for signature, instances in grouped.items():
        if not (2 <= len(instances) <= 12):
            continue
        is_plausible = (
            signature.keyword in SECTION_KEYWORDS
            or signature.numeral in ("upper_roman", "lower_roman")
        )
        if not is_plausible:
            continue

        # No ordinal resets means nothing to partition: a single global grammar
        # already describes the region. Refusing to partition here is what keeps
        # single-part papers on the fast path.
        if not reset_offsets:
            continue

        # A section marker must *immediately* precede the reset it explains.
        hits = sum(
            1
            for reset in reset_offsets
            if any(0 <= reset - inst.start < SECTION_ALIGNMENT_WINDOW
                   for inst in instances)
        )
        alignment = hits / len(reset_offsets)
        if alignment < SECTION_ALIGNMENT_MIN:
            continue
        if best is None or alignment > best[0]:
            best = (alignment, signature)

    return best[1] if best else None


def partition_regions(
    text: str,
    candidates: Sequence[Candidate],
    section_signature: Optional[Signature],
    global_grammar: Grammar,
) -> Tuple[List[Tuple[int, int]], bool]:
    """
    Split the text into regions that each get their own induced grammar.

    Multi-part papers (PHẦN I multiple-choice, PHẦN II true/false with a)-d),
    PHẦN III short answer) restart ordinals and change option style per part, so
    a single global grammar cannot describe them.

    Partitioning is accepted only when it measurably improves the fit. A split
    that fragments a coherent document lowers the length-weighted score, and
    rejecting it there is what stops sectioning from damaging the common
    single-convention case. Returns (regions, was_split).
    """
    whole = [(0, len(text))]
    if section_signature is None:
        return whole, False

    starts = sorted(c.start for c in candidates if c.signature == section_signature)
    if not starts:
        return whole, False

    boundaries = sorted({0, *(s for s in starts if s > 0), len(text)})
    regions = [
        (lo, hi) for lo, hi in zip(boundaries, boundaries[1:]) if hi - lo > 200
    ]
    if len(regions) < 2:
        return whole, False

    # Length-weighted mean score of the per-region grammars.
    total_len = sum(hi - lo for lo, hi in regions)
    weighted = 0.0
    for lo, hi in regions:
        local = [c for c in candidates if lo <= c.start < hi]
        if not local:
            continue
        grammar = induce_grammar(local, (lo, hi))
        if grammar.question is None or grammar.option is None:
            return whole, False  # A region we cannot describe: reject the split.
        weighted += grammar.score * (hi - lo) / max(1, total_len)

    if weighted <= global_grammar.score + SECTION_SPLIT_MIN_GAIN:
        return whole, False
    return regions, True


# ── Stage 3: run coherence, validation, repair ────────────────────────────────


def enforce_run_coherence(options: Sequence[Candidate]) -> List[Candidate]:
    """
    Keep only maximal monotone runs that start at the first ordinal.

    This is what rejects a stray "(D)" inside directions prose such as
    "mark the letter (A), (B), (C), or (D) on your answer sheet" while keeping
    genuine inline runs like "A. who B. which C. whom D. whose".
    """
    ordered = sorted(options, key=lambda c: c.start)
    kept: List[Candidate] = []
    index = 0
    while index < len(ordered):
        run = [ordered[index]]
        expected = ordered[index].ordinal + 1
        cursor = index + 1
        while cursor < len(ordered) and ordered[cursor].ordinal == expected:
            run.append(ordered[cursor])
            expected += 1
            cursor += 1
        if run[0].ordinal == 1 and len(run) >= 2:
            kept.extend(run)
            index = cursor
        else:
            index += 1
    return kept


def _relaxed_marker_re(signature: Signature) -> re.Pattern[str]:
    """
    A permissive variant of an induced signature, for gap repair only.

    Drops decoration and tolerates OCR glyph confusion in digits. Applied to a
    single known-suspect interval, never document-wide.
    """
    keyword = f"(?:{re.escape(signature.keyword)}\\s*)?" if signature.keyword else ""
    bra = re.escape(signature.bracket[0]) + "?" if signature.bracket else ""
    ket = re.escape(signature.bracket[1]) + "?" if signature.bracket else ""
    if signature.numeral == "arabic":
        ordinal = r"[\dlIiOoSsB]{1,4}"
    elif signature.numeral in ("upper_alpha", "upper_roman"):
        ordinal = r"[A-Z]{1,4}"
    else:
        ordinal = r"[a-z]{1,4}"
    term = f"[{re.escape('.:)-')}]?" if signature.terminator else ""
    return re.compile(
        rf"(?:\*\*|__)?{keyword}{bra}({ordinal}){ket}{term}(?:\*\*|__)?",
        re.IGNORECASE,
    )


_OCR_DIGIT_FIXUPS = str.maketrans({"l": "1", "I": "1", "i": "1",
                                   "O": "0", "o": "0", "S": "5",
                                   "s": "5", "B": "8"})


def _repair_ordinal(token: str) -> Optional[int]:
    fixed = token.translate(_OCR_DIGIT_FIXUPS)
    return int(fixed) if fixed.isdigit() else None


def repair_ordinal_gaps(
    text: str,
    mask: Sequence[int],
    questions: List[Candidate],
    signature: Signature,
    region_end: int,
) -> Tuple[List[Candidate], List[int]]:
    """
    Recover questions whose marker was missed, using a relaxed signature.

    Only the interval bracketing the missing ordinal is rescanned, so cost
    stays proportional to the number of anomalies rather than document size.
    Returns (augmented_questions, still_missing_ordinals).
    """
    if not questions:
        return questions, []

    by_ordinal = {q.ordinal: q for q in questions}
    lo, hi = min(by_ordinal), max(by_ordinal)
    missing = [o for o in range(lo, hi + 1) if o not in by_ordinal]
    if not missing:
        return questions, []

    # A plausible number of holes means OCR dropped a few markers. An
    # implausible number means the induced grammar is wrong, and scanning each
    # hole would cost O(missing x interval) for nothing. Report and escalate.
    if (
        len(missing) > MAX_REPAIR_ABSOLUTE
        or len(missing) > MAX_REPAIR_RATIO * len(questions)
    ):
        return questions, missing

    relaxed = _relaxed_marker_re(signature)
    recovered: List[Candidate] = []
    unresolved: List[int] = []

    for ordinal in missing:
        prev_q = by_ordinal.get(ordinal - 1)
        next_q = by_ordinal.get(ordinal + 1)
        search_lo = prev_q.end if prev_q else 0
        search_hi = next_q.start if next_q else region_end
        if search_hi <= search_lo:
            unresolved.append(ordinal)
            continue

        found = None
        for match in relaxed.finditer(text, search_lo, search_hi):
            if mask[match.start()]:
                continue
            if _repair_ordinal(match.group(1)) != ordinal:
                continue
            found = Candidate(
                start=match.start(),
                end=match.end(),
                signature=signature,
                ordinal=ordinal,
                surface=match.group(0).strip(),
            )
            break

        if found is None:
            unresolved.append(ordinal)
        else:
            recovered.append(found)
            by_ordinal[ordinal] = found

    if recovered:
        questions = sorted(questions + recovered, key=lambda c: c.start)
    return questions, unresolved


# ── Stage 4: structural derivation ────────────────────────────────────────────


def _make_span(text: str, start: int, end: int, label: str) -> Optional[Dict[str, Any]]:
    """Build a span, trimming surrounding whitespace but keeping true offsets."""
    if end <= start:
        return None
    raw = text[start:end]
    lead = len(raw) - len(raw.lstrip())
    trail = len(raw) - len(raw.rstrip())
    start += lead
    end -= trail
    if end <= start:
        return None
    return {"start": start, "end": end, "label": label, "text": text[start:end]}


def _strip_trailing_decor(text: str, start: int, end: int) -> int:
    """Exclude a dangling '**' that belongs to the preceding marker."""
    while end > start and text[start:end].endswith(("**", "__")):
        end -= 2
    return end


def derive_structure_spans(
    text: str,
    questions: Sequence[Candidate],
    options: Sequence[Candidate],
    region_end: int,
) -> List[Dict[str, Any]]:
    """
    Turn the marker lattice into stem/option_text spans by subtraction.

    Once markers are fixed there is no ambiguity left here: a stem runs from the
    end of its question marker to the first option of that question, and an
    option's text runs to the next marker.
    """
    spans: List[Dict[str, Any]] = []
    bounds = _question_bounds(questions, region_end)
    option_starts = sorted(options, key=lambda c: c.start)

    for index, question in enumerate(questions):
        q_end = min(bounds[index + 1], region_end)
        label_span = _make_span(text, question.start, question.end, "question_label")
        if label_span:
            spans.append(label_span)

        owned = [o for o in option_starts if question.end <= o.start < q_end]

        stem_end = owned[0].start if owned else q_end
        stem_end = _strip_trailing_decor(text, question.end, stem_end)
        stem_span = _make_span(text, question.end, stem_end, "stem")
        if stem_span:
            spans.append(stem_span)

        for pos, option in enumerate(owned):
            opt_label = _make_span(text, option.start, option.end, "option_label")
            if opt_label:
                spans.append(opt_label)
            text_end = owned[pos + 1].start if pos + 1 < len(owned) else q_end
            text_end = _strip_trailing_decor(text, option.end, text_end)
            opt_text = _make_span(text, option.end, text_end, "option_text")
            if opt_text:
                spans.append(opt_text)

    return spans


# ── Stage 5: stimulus gaps ────────────────────────────────────────────────────


def find_stimulus_gaps(
    text: str,
    questions: Sequence[Candidate],
    region: Tuple[int, int],
    min_length: int = 200,
) -> List[Dict[str, Any]]:
    """
    Identify unclaimed text runs that are stimulus candidates.

    Stimulus is semantic ("these questions share this passage") and is not
    structurally recoverable in general, but it can only live in the gaps
    between question blocks. Explicit headers ("Questions 131-134 refer to the
    following advertisement") bind a gap to an exact ordinal range for free;
    everything else is handed to the LLM as a short, line-numbered candidate
    list rather than as free-form text.
    """
    region_start, region_end = region
    gaps: List[Dict[str, Any]] = []

    cursor = region_start
    ordered = sorted(questions, key=lambda c: c.start)
    edges: List[Tuple[int, int]] = []
    for question in ordered:
        if question.start > cursor:
            edges.append((cursor, question.start))
        cursor = max(cursor, question.end)
    if cursor < region_end:
        edges.append((cursor, region_end))

    for lo, hi in edges:
        body = text[lo:hi].strip()
        if len(body) < min_length:
            continue
        # The instruction line sits near the head of the gap, but leftover option
        # text from a mis-OCR'd preceding question can push it back; measured
        # offsets reached ~930 chars.
        header = STIMULUS_HEADER_RE.search(text, lo, min(hi, lo + 1000))
        gaps.append(
            {
                "start": lo,
                "end": hi,
                "length": hi - lo,
                "serves": (
                    [int(header.group(1)), int(header.group(2))] if header else None
                ),
                "header": header.group(0) if header else None,
                "resolved": header is not None,
            }
        )
    return gaps


# ── Stage 6: answer key ───────────────────────────────────────────────────────


def extract_answer_key(
    text: str, questions: Sequence[Candidate], max_entry_length: int = 48
) -> Dict[str, str]:
    """
    Bind answers to question ordinals from a trailing answer-key region.

    Answer keys are recognisable structurally: ordinals restart and each entry
    is only a letter or two, so mean entry length collapses relative to real
    question blocks.
    """
    if not questions:
        return {}

    known = {q.ordinal for q in questions}
    tail_start = max(q.end for q in questions)
    tail = text[tail_start:]
    if not tail.strip():
        return {}

    answers: Dict[str, str] = {}
    matches = list(ANSWER_KEY_ENTRY_RE.finditer(tail))
    if len(matches) < 3:
        return {}

    gaps = [b.start() - a.end() for a, b in zip(matches, matches[1:])]
    if gaps and statistics.fmean(gaps) > max_entry_length:
        return {}  # Too much prose between entries: not a key table.

    for match in matches:
        ordinal = int(match.group(1))
        if ordinal in known:
            answers[str(ordinal)] = match.group(2).upper()
    return answers


# ── Confidence ────────────────────────────────────────────────────────────────


def compute_confidence(
    questions: Sequence[Candidate],
    option_counts: Sequence[int],
    grammar: Grammar,
    unresolved_ordinals: Sequence[int],
    masked_collisions: int,
) -> Tuple[float, Dict[str, Any]]:
    """
    Grade the parse so a weak result can escalate instead of shipping silently.

    ``induction_margin`` is the cheapest strong signal: a wide gap between the
    best and runner-up hypothesis means the document has one obvious grammar.
    """
    if not questions:
        return 0.0, {"reason": "no questions induced"}

    ordinals = sorted(q.ordinal for q in questions)
    unique = len(set(ordinals))
    expected = ordinals[-1] - ordinals[0] + 1
    continuity = unique / max(1, expected)
    uniformity, mode = _uniformity(list(option_counts))
    margin = min(1.0, grammar.margin / 2.0) if grammar.margin > 0 else 0.0
    unresolved_penalty = len(unresolved_ordinals) / max(1, len(ordinals))

    # Repeated ordinals mean the same question was matched twice -- an exam
    # bundled with its own answer key, or duplicated page overlap. Continuity
    # alone cannot see this because it only counts distinct values.
    duplicates = len(ordinals) - unique
    duplicate_penalty = duplicates / max(1, len(ordinals))

    # An option-free grammar (essay / short-answer) has no option uniformity to
    # measure; scoring it against zero would falsely condemn a clean parse, so
    # the weight is redistributed to the signals that do apply.
    if grammar.option is None:
        confidence = (
            0.55 * continuity
            + 0.30 * margin
            + 0.15 * (1.0 - min(1.0, masked_collisions / max(1, len(ordinals))))
        )
    else:
        confidence = (
            0.35 * continuity
            + 0.30 * uniformity
            + 0.20 * margin
            + 0.15 * (1.0 - min(1.0, masked_collisions / max(1, len(ordinals))))
        )
    confidence = max(
        0.0,
        min(1.0, confidence - 0.5 * unresolved_penalty - 0.5 * duplicate_penalty),
    )

    return confidence, {
        "ordinal_continuity": round(continuity, 4),
        "option_mode": mode,
        "option_uniformity": round(uniformity, 4),
        "induction_margin": round(grammar.margin, 4),
        "unresolved_ordinals": list(unresolved_ordinals),
        "duplicate_ordinals": duplicates,
        "question_range": [ordinals[0], ordinals[-1]],
        "questions_unique": unique,
    }


# ── Orchestration ─────────────────────────────────────────────────────────────


def parse_chunk_deterministic(raw_text: str) -> ParseResult:
    """
    Parse one chunk's structural tags without any LLM call.

    Emits spans in the same schema as ``annotate_ocr.parse_xml_annotations``,
    so the result feeds ``parser.parse_spans_into_structured_questions``
    unchanged. Inspect ``needs_llm_review`` before trusting the output.
    """
    if not raw_text or not raw_text.strip():
        return ParseResult(diagnostics={"reason": "empty input"})

    mask = build_mask(raw_text)
    candidates = harvest_candidates(raw_text, mask)
    if not candidates:
        return ParseResult(
            confidence=0.0,
            diagnostics={"reason": "no enumerator candidates", "candidates": 0},
        )

    # Provisional global induction, used only to locate section boundaries.
    provisional = induce_grammar(candidates, (0, len(raw_text)))
    grouped = _group_by_signature(candidates)
    provisional_questions = (
        grouped.get(provisional.question, []) if provisional.question else []
    )
    section_signature = induce_section_signature(candidates, provisional_questions)
    regions, was_split = partition_regions(
        raw_text, candidates, section_signature, provisional
    )
    if not was_split:
        section_signature = None

    all_spans: List[Dict[str, Any]] = []
    grammars: List[Grammar] = []
    all_questions: List[Candidate] = []
    all_option_counts: List[int] = []
    unresolved: List[int] = []
    escalations: List[Tuple[int, int]] = []
    stimulus_gaps: List[Dict[str, Any]] = []

    for region in regions:
        region_start, region_end = region
        local = [c for c in candidates if region_start <= c.start < region_end]
        if not local:
            continue

        grammar = induce_grammar(local, region)
        grammar.section = section_signature
        grammars.append(grammar)

        if grammar.question is None:
            escalations.append(region)
            continue

        local_grouped = _group_by_signature(local)
        questions = local_grouped.get(grammar.question, [])
        raw_options = (
            local_grouped.get(grammar.option, []) if grammar.option else []
        )

        questions, region_unresolved = repair_ordinal_gaps(
            raw_text, mask, questions, grammar.question, region_end
        )
        unresolved.extend(region_unresolved)

        # Options must nest inside a question interval and form coherent runs.
        bounds = _question_bounds(questions, region_end)
        nested = [
            o
            for o in raw_options
            if any(lo < o.start < hi for lo, hi in zip(bounds, bounds[1:]))
        ]
        options = enforce_run_coherence(nested)

        if section_signature is not None and region_start > 0:
            section_span = _make_span(
                raw_text,
                region_start,
                min(region_start + 200, region_end),
                "section",
            )
            if section_span:
                line_end = raw_text.find("\n", section_span["start"])
                if line_end != -1 and line_end < section_span["end"]:
                    section_span = _make_span(
                        raw_text, section_span["start"], line_end, "section"
                    )
                if section_span:
                    all_spans.append(section_span)

        all_spans.extend(
            derive_structure_spans(raw_text, questions, options, region_end)
        )
        counts = _options_per_question(options, questions, region_end)
        all_option_counts.extend(counts)
        all_questions.extend(questions)
        stimulus_gaps.extend(find_stimulus_gaps(raw_text, questions, region))

        # Flag individual questions whose option count breaks the local mode.
        # Skipped for option-free grammars, where a count of zero is correct.
        if grammar.option is not None:
            _, mode = _uniformity(counts)
            for index, count in enumerate(counts):
                if mode and count != mode:
                    lo = questions[index].start
                    hi = min(bounds[index + 1], region_end)
                    escalations.append((lo, hi))

    masked_collisions = sum(
        1 for c in candidates if c.start < len(mask) and mask[c.start]
    )
    reference_grammar = max(grammars, key=lambda g: g.score, default=Grammar())
    confidence, diagnostics = compute_confidence(
        all_questions,
        all_option_counts,
        reference_grammar,
        unresolved,
        masked_collisions,
    )

    diagnostics.update(
        {
            "candidates_harvested": len(candidates),
            "signature_classes": len(grouped),
            "regions": len(regions),
            "grammars": [g.describe() for g in grammars],
            "questions_found": len(all_questions),
            "options_found": sum(all_option_counts),
            "escalation_intervals": len(escalations),
            "stimulus_gaps": len(stimulus_gaps),
            "stimulus_gaps_resolved": sum(1 for g in stimulus_gaps if g["resolved"]),
        }
    )

    return ParseResult(
        spans=sorted(all_spans, key=lambda s: (s["start"], -s["end"])),
        grammars=grammars,
        confidence=confidence,
        diagnostics=diagnostics,
        escalation_intervals=escalations,
        stimulus_gaps=stimulus_gaps,
        answer_key=extract_answer_key(raw_text, all_questions),
        unresolved_ordinals=sorted(unresolved),
    )


# ── Serialisation helper ──────────────────────────────────────────────────────


def spans_to_annotated_xml(raw_text: str, spans: Sequence[Dict[str, Any]]) -> str:
    """
    Re-emit the source with inline tags, for merger/visualiser compatibility.

    Because tags are inserted into the original string rather than regenerated,
    source fidelity is structural: the text cannot drift.
    """
    events: List[Tuple[int, int, int, str]] = []
    for order, span in enumerate(spans):
        # Close tags first at a shared offset; open longer spans before shorter.
        events.append((span["start"], 1, -(span["end"]), f"<{span['label']}>"))
        events.append((span["end"], 0, order, f"</{span['label']}>"))
    events.sort(key=lambda e: (e[0], e[1], e[2]))

    out: List[str] = []
    cursor = 0
    for offset, _, _, tag in events:
        out.append(raw_text[cursor:offset])
        out.append(tag)
        cursor = offset
    out.append(raw_text[cursor:])
    return "".join(out)
