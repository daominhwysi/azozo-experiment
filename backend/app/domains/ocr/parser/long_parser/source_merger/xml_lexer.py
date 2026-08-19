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


def lex_annotations(parsed_xml: str) -> Tuple[str, List[LocalSpan], Dict[str, Any]]:
    """
    Tolerant XML lexer that extracts de-tagged parsed text and paired LocalSpan objects.
    Records any malformed tags or mismatched nesting in lexical_report.
    """
    if not parsed_xml:
        return "", [], {"errors": []}

    # Clean out comments
    cleaned_xml = re.sub(r"<!--.*?-->", "", parsed_xml, flags=re.DOTALL)
    
    parsed_chars = []
    events = []  # List of (p_offset, tag_name, is_open, raw_tag_str)
    errors = []

    pos = 0
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
        tag_name = match.group(2).strip()

        if tag_name in ALLOWED_TAGS:
            # Recognized annotation tag
            events.append((p_offset, tag_name, not is_closing, match.group(0)))
        else:
            # Unknown or split/malformed tag name (e.g. <option_la\nbel>)
            errors.append(f"Unrecognized or malformed tag: {match.group(0)}")
            # Treat contents of unknown tag as non-authoritative text
            parsed_chars.append(match.group(0))
            p_offset += len(match.group(0))

        last_idx = match_end

    if last_idx < n:
        chunk_str = cleaned_xml[last_idx:]
        parsed_chars.append(chunk_str)
        p_offset += len(chunk_str)

    parsed_text = "".join(parsed_chars)

    # Pair events into LocalSpans
    spans: List[LocalSpan] = []
    stack: List[Tuple[str, int]] = []
    current_q_num: Optional[str] = None
    current_exam_code: Optional[str] = None

    for offset, tag_name, is_open, raw_tag in events:
        if is_open:
            stack.append((tag_name, offset))
        else:
            # Closing tag
            if stack and stack[-1][0] == tag_name:
                open_name, open_offset = stack.pop()
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
                ))
            else:
                # Mismatched tag
                errors.append(f"Mismatched closing tag </{tag_name}> at offset {offset}")

    # Residual unclosed tags
    while stack:
        open_name, open_offset = stack.pop()
        errors.append(f"Unclosed tag <{open_name}> starting at offset {open_offset}")
        spans.append(LocalSpan(
            p_start=open_offset,
            p_end=len(parsed_text),
            label=open_name,
            is_valid=False,
            text=parsed_text[open_offset:],
            question_num=current_q_num,
            exam_code=current_exam_code,
        ))

    lexical_report = {
        "errors": errors,
        "total_tags_found": len(events),
        "spans_created": len(spans),
    }

    return parsed_text, spans, lexical_report
