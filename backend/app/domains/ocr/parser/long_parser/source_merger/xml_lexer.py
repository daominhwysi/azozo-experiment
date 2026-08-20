import re
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple, Optional

ALLOWED_TAGS = {
    "section",
    "stimulus",
    "question",
    "question_label",
    "stem",
    "option_label",
    "option_text",
    "explanation",
}


@dataclass
class LocalSpan:
    p_start: int
    p_end: int
    label: str
    is_valid: bool = True
    text: str = ""
    question_num: Optional[str] = None
    exam_code: Optional[str] = None
    is_self_closing: bool = False
    raw_tag: Optional[str] = None


def lex_annotations(parsed_xml: str) -> Tuple[str, List[LocalSpan], Dict[str, Any]]:
    """
    Tolerant XML lexer that extracts de-tagged parsed text and paired LocalSpan objects.
    Records any malformed tags or mismatched nesting in lexical_report.
    Properly recognizes and preserves self-closing anchor tags (e.g. <stimulus ... />).
    """
    if not parsed_xml:
        return "", [], {"errors": []}

    # Clean out comments, prohibited page metadata blocks, and terminal end sentinels
    cleaned_xml = re.sub(r"<!--.*?-->", "", parsed_xml, flags=re.DOTALL)
    cleaned_xml = re.sub(r"<\s*\|\s*END\s*\|\s*>", "", cleaned_xml)
    cleaned_xml = re.sub(r"<\s*\|\s*endoftext\s*\|\s*>", "", cleaned_xml)
    cleaned_xml = re.sub(r"</?page_metadata>\s*\{[\s\S]*?\}\s*</?page_metadata>", "", cleaned_xml)
    cleaned_xml = re.sub(r"<page_metadata>[\s\S]*?</page_metadata>", "", cleaned_xml)
    cleaned_xml = re.sub(r"</?pages?>", "", cleaned_xml)
    cleaned_xml = re.sub(r"</?page_metadata>", "", cleaned_xml)
    
    parsed_chars = []
    events = []  # List of (p_offset, tag_name, event_type, raw_tag_str)
    errors = []

    n = len(cleaned_xml)
    p_offset = 0

    tag_pattern = re.compile(r"<(/?)([a-zA-Z_][a-zA-Z0-9_\-\n\r]*)(\s*[^>]*)>")

    last_idx = 0
    for match in tag_pattern.finditer(cleaned_xml):
        match_start, match_end = match.span()

        # Text before tag
        if match_start > last_idx:
            chunk_str = cleaned_xml[last_idx:match_start]
            parsed_chars.append(chunk_str)
            p_offset += len(chunk_str)

        is_closing = match.group(1) == "/"
        tag_name = match.group(2).strip().lower()
        attrs = match.group(3)
        raw_tag_str = match.group(0)
        is_self_closing = (
            raw_tag_str.endswith("/>")
            or attrs.strip().endswith("/")
            or (tag_name == "stimulus" and "start_anchor=" in raw_tag_str)
            or (tag_name == "figure")
        )

        if tag_name in ALLOWED_TAGS:
            if is_self_closing:
                if not raw_tag_str.endswith("/>"):
                    raw_tag_str = raw_tag_str[:-1].rstrip() + " />"
                events.append((p_offset, tag_name, "self_closing", raw_tag_str))
            elif is_closing:
                events.append((p_offset, tag_name, "close", raw_tag_str))
            else:
                events.append((p_offset, tag_name, "open", raw_tag_str))
        else:
            # Unknown or split/malformed tag name (e.g. <option_la\nbel>)
            errors.append(f"Unrecognized or malformed tag: {raw_tag_str}")
            # Treat contents of unknown tag as non-authoritative text
            parsed_chars.append(raw_tag_str)
            p_offset += len(raw_tag_str)

        last_idx = match_end

    if last_idx < n:
        chunk_str = cleaned_xml[last_idx:]
        parsed_chars.append(chunk_str)
        p_offset += len(chunk_str)

    parsed_text = "".join(parsed_chars)

    # Pair events into LocalSpans
    spans: List[LocalSpan] = []
    stack: List[Tuple[str, int, str]] = []
    current_q_num: Optional[str] = None
    current_exam_code: Optional[str] = None

    for offset, tag_name, event_type, raw_tag in events:
        if event_type == "self_closing":
            # Direct self-closing point span at offset
            spans.append(LocalSpan(
                p_start=offset,
                p_end=offset,
                label=tag_name,
                is_valid=True,
                text="",
                question_num=current_q_num,
                exam_code=current_exam_code,
                is_self_closing=True,
                raw_tag=raw_tag,
            ))
        elif event_type == "open":
            stack.append((tag_name, offset, raw_tag))
        elif event_type == "close":
            # Closing tag
            if stack and stack[-1][0] == tag_name:
                open_name, open_offset, open_raw = stack.pop()
                span_text = parsed_text[open_offset:offset]

                # Extract question_num if this is question_label
                if open_name == "question_label":
                    q_m = re.search(r"\b(\d{1,4})\b", span_text)
                    if q_m:
                        current_q_num = q_m.group(1)

                spans.append(LocalSpan(
                    p_start=open_offset,
                    p_end=offset,
                    label=open_name,
                    is_valid=True,
                    text=span_text,
                    question_num=current_q_num,
                    exam_code=current_exam_code,
                    is_self_closing=False,
                    raw_tag=open_raw,
                ))
            else:
                # Mismatched tag
                errors.append(f"Mismatched closing tag </{tag_name}> at offset {offset}")

    # Residual unclosed tags
    while stack:
        open_name, open_offset, open_raw = stack.pop()
        errors.append(f"Unclosed tag <{open_name}> starting at offset {open_offset}")
        spans.append(LocalSpan(
            p_start=open_offset,
            p_end=len(parsed_text),
            label=open_name,
            is_valid=False,
            text=parsed_text[open_offset:],
            question_num=current_q_num,
            exam_code=current_exam_code,
            is_self_closing=False,
            raw_tag=open_raw,
        ))

    lexical_report = {
        "errors": errors,
        "total_tags_found": len(events),
        "spans_created": len(spans),
    }

    return parsed_text, spans, lexical_report
