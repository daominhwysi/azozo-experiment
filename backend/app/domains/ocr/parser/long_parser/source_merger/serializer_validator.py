import re
from typing import List, Dict, Any, Tuple, Optional
from backend.app.domains.ocr.parser.long_parser.source_merger.types import GlobalSpan, MergeInvariantError

LABEL_PRIORITY = {
    "section": 1,
    "stimulus": 2,
    "question": 3,
    "question_label": 4,
    "stem": 5,
    "option_label": 6,
    "option_text": 7,
    "explanation": 8,
}


def remove_annotation_tags(xml_str: str) -> str:
    """
    Strips all recognized annotation tags from xml_str.
    """
    pattern = re.compile(
        r"</?(?:section|stimulus|question|question_label|stem|option_label|option_text|explanation)[^>]*>",
        flags=re.IGNORECASE
    )
    return pattern.sub("", xml_str)


def serialize_annotations(canonical_text: str, selected_spans: List[GlobalSpan]) -> str:
    """
    Serialize selected opening and closing tags around unchanged canonical_text.
    Events at the same offset follow strict ordering:
    1. Close inner before outer (is_open=False, label_priority descending).
    2. Open outer before inner (is_open=True, label_priority ascending).
    """
    events: List[Tuple[int, int, int, int, str]] = []

    for span in selected_spans:
        prio = LABEL_PRIORITY.get(span.label, 99)
        # Ordering is driven by span extent, not by label priority. Priority only
        # breaks ties between spans covering the identical range: two spans that
        # share a boundary must nest by length, otherwise the shorter one closes
        # while the longer one is still open and the output is unbalanced.
        # (offset, is_open, extent_key, priority_key, tag_name)
        events.append((span.start, 1, -span.end, prio, span.label))
        events.append((span.end, 0, -span.start, -prio, span.label))

    # For the same offset:
    # 1. Close tags before open tags.
    # 2. Closes: the most recently opened span closes first -> largest start first.
    # 3. Opens: the outermost span opens first -> largest end first.
    events.sort(key=lambda ev: (ev[0], ev[1], ev[2], ev[3]))

    out_chunks = []
    curr_pos = 0

    for offset, is_open, _extent, _prio, tag in events:
        if offset > curr_pos:
            out_chunks.append(canonical_text[curr_pos:offset])
            curr_pos = offset

        if is_open:
            out_chunks.append(f"<{tag}>")
        else:
            out_chunks.append(f"</{tag}>")

    if curr_pos < len(canonical_text):
        out_chunks.append(canonical_text[curr_pos:])

    return "".join(out_chunks)


def validate_result(
    canonical_text: str,
    merged_xml: str,
    selected_spans: List[GlobalSpan]
) -> Dict[str, Any]:
    """
    Validate merged_xml output against canonical_text.
    """
    detagged = remove_annotation_tags(merged_xml)
    source_fidelity_ok = (detagged == canonical_text)

    # Check balanced tags
    tag_re = re.compile(r"</?([a-zA-Z_][a-zA-Z0-9_]*)>")
    stack = []
    balanced_ok = True

    for m in tag_re.finditer(merged_xml):
        full_tag = m.group(0)
        tag_name = m.group(1)

        if full_tag.startswith("</"):
            if not stack or stack[-1] != tag_name:
                balanced_ok = False
                break
            stack.pop()
        else:
            stack.append(tag_name)

    if stack:
        balanced_ok = False

    report = {
        "source_fidelity_ok": source_fidelity_ok,
        "balanced_ok": balanced_ok,
        "selected_spans_count": len(selected_spans),
        "canonical_length": len(canonical_text),
        "merged_xml_length": len(merged_xml),
        "out_of_bounds_count": sum(
            1
            for span in selected_spans
            if span.start < 0 or span.end < span.start or span.end > len(canonical_text)
        ),
    }

    if not source_fidelity_ok:
        report["error"] = "Merged XML de-tagged text does not match canonical original text!"
        raise MergeInvariantError(f"Merge Invariant Failed! Detagged XML != Canonical original text.\nReport: {report}")

    if not balanced_ok:
        raise MergeInvariantError(
            f"Merge Invariant Failed! Serialized annotation tags are not balanced.\nReport: {report}"
        )

    if report["out_of_bounds_count"]:
        raise MergeInvariantError(
            f"Merge Invariant Failed! Annotation spans are out of bounds.\nReport: {report}"
        )

    return report


def build_structured_stimuli(
    canonical_text: str,
    selected_spans: List[GlobalSpan],
) -> Dict[str, Dict[str, Any]]:
    stimuli: Dict[str, Dict[str, Any]] = {}
    for span in sorted(
        (item for item in selected_spans if item.label == "stimulus"),
        key=lambda item: (item.start, item.end),
    ):
        stimulus_id = f"stim_{span.start}_{span.end}"
        stimuli[stimulus_id] = {
            "text": canonical_text[span.start:span.end].strip(),
            "source_range": {"start": span.start, "end": span.end},
            "provenance_chunk_indices": [span.chunk_index],
        }
    return stimuli


def build_structured_questions(
    canonical_text: str,
    selected_spans: List[GlobalSpan],
    structured_stimuli: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Derive structured question objects directly from reconciled global spans on canonical text.
    """
    # Group spans by question hierarchy
    q_label_spans = sorted(
        (s for s in selected_spans if s.label == "question_label"),
        key=lambda span: (span.start, span.end),
    )
    stem_spans = [s for s in selected_spans if s.label == "stem"]
    opt_label_spans = [s for s in selected_spans if s.label == "option_label"]
    opt_text_spans = [s for s in selected_spans if s.label == "option_text"]
    stimulus_spans = sorted(
        (s for s in selected_spans if s.label == "stimulus"),
        key=lambda span: (span.start, span.end),
    )
    explanation_spans = [s for s in selected_spans if s.label == "explanation"]

    questions: List[Dict[str, Any]] = []

    for q_idx, q_lab in enumerate(q_label_spans):
        q_num = q_lab.question_num
        if not q_num:
            q_num_match = re.search(r"\b(\d{1,4})\b", canonical_text[q_lab.start:q_lab.end])
            q_num = q_num_match.group(1) if q_num_match else str(q_idx + 1)

        # Find stem following q_lab
        stem_text = ""
        matching_stems = [s for s in stem_spans if s.start >= q_lab.end and (q_idx + 1 >= len(q_label_spans) or s.start < q_label_spans[q_idx + 1].start)]
        if matching_stems:
            stem_text = canonical_text[matching_stems[0].start:matching_stems[0].end].strip()

        # Find options
        options = []
        q_end_pos = q_label_spans[q_idx + 1].start if q_idx + 1 < len(q_label_spans) else len(canonical_text)
        
        q_opt_labs = [s for s in opt_label_spans if q_lab.start <= s.start < q_end_pos]
        q_opt_labs.sort(key=lambda span: (span.start, span.end))
        for option_index, o_lab in enumerate(q_opt_labs):
            lab_str = canonical_text[o_lab.start:o_lab.end].strip()
            option_end = (
                q_opt_labs[option_index + 1].start
                if option_index + 1 < len(q_opt_labs)
                else q_end_pos
            )
            matching_o_texts = [
                s for s in opt_text_spans
                if o_lab.end <= s.start < option_end
            ]
            txt_str = ""
            if matching_o_texts:
                txt_str = canonical_text[matching_o_texts[0].start:matching_o_texts[0].end].strip()

            options.append({
                "label": lab_str,
                "text": txt_str,
            })

        # Find enclosing stimulus
        stim_id = None
        stim_text = ""
        preceding_stims = [s for s in stimulus_spans if s.end <= q_lab.start]
        enclosing_stims = [
            s for s in stimulus_spans
            if s.start <= q_lab.start and s.end >= q_lab.end
        ]
        active_stim = enclosing_stims[-1] if enclosing_stims else (
            preceding_stims[-1] if preceding_stims else None
        )
        if active_stim:
            stim_text = canonical_text[active_stim.start:active_stim.end].strip()
            stim_id = f"stim_{active_stim.start}_{active_stim.end}"

        # Find explanation
        exp_text = ""
        matching_exps = [s for s in explanation_spans if q_lab.start <= s.start < q_end_pos]
        if matching_exps:
            exp_text = canonical_text[matching_exps[0].start:matching_exps[0].end].strip()

        questions.append({
            "id": f"q_{q_lab.start}_{q_lab.end}",
            "question_number": q_num,
            "question_label": canonical_text[q_lab.start:q_lab.end].strip(),
            "stem": stem_text,
            "options": options,
            "stimulus_id": stim_id,
            "stimulus_text": stim_text,
            "explanation": exp_text,
            "source_range": {"start": q_lab.start, "end": q_end_pos},
            "provenance_chunk_indices": [q_lab.chunk_index],
        })

    return questions
