import json
import re
from typing import List, Dict, Any, Optional

class DocumentStateStack:
    """
    Formal stack-based state machine resolving nested document hierarchies 
    (CHAPTER -> SECTION -> STIMULUS -> QUESTION) with validation rules.
    """
    def __init__(self, doc_id: str = "doc_global"):
        self.doc_id = doc_id
        self.stack: List[Dict[str, Any]] = []
        self.completed_groups: List[Dict[str, Any]] = []
        self.current_section = "global"

    def process_metadata_stream(self, page_metadata_stream: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for meta in sorted(page_metadata_stream, key=lambda x: x.get("p", 0)):
            page_num = meta.get("p", 1)

            # Handle top boundary continuity
            if meta.get("head") in ("CONT_GROUP", "CONT_STIM", "CONT_THEORY") and self.stack:
                if "pages" in self.stack[-1]:
                    if page_num not in self.stack[-1]["pages"]:
                        self.stack[-1]["pages"].append(page_num)

            for event in meta.get("seq", []):
                if not isinstance(event, list) or not event:
                    continue
                event_type = event[0]

                if event_type == "SECTION_START":
                    self.current_section = str(event[1]) if len(event) > 1 else "global"

                elif event_type == "STIM_START":
                    stim_name = str(event[1]) if len(event) > 1 else "stim_1"
                    stim_id = f"{self.doc_id}:{self.current_section}:p{page_num}:{stim_name}"
                    group_node = {
                        "group_id": stim_id,
                        "type": "CONTEXT_QUESTION_GROUP",
                        "pages": [page_num],
                        "questions": []
                    }
                    self.stack.append(group_node)

                elif event_type == "THEORY_START":
                    theory_name = str(event[1]) if len(event) > 1 else "theory_1"
                    theory_id = f"{self.doc_id}:{self.current_section}:p{page_num}:{theory_name}"
                    group_node = {
                        "group_id": theory_id,
                        "type": "LECTURE_THEORY",
                        "pages": [page_num],
                        "questions": []
                    }
                    self.stack.append(group_node)

                elif event_type == "Q_START":
                    q_num = str(event[1]) if len(event) > 1 else "1"
                    q_id = f"{self.doc_id}:{self.current_section}:p{page_num}:q{q_num}"
                    if self.stack:
                        self.stack[-1]["questions"].append(q_id)

            # Handle bottom boundary clean closure
            if meta.get("tail") == "CLEAN" and self.stack:
                closed_group = self.stack.pop()
                closed_group["status"] = "CLOSED"
                self.completed_groups.append(closed_group)

        # Flush residual open stack
        while self.stack:
            group = self.stack.pop()
            group["status"] = "PARTIAL_CLOSED"
            self.completed_groups.append(group)

        return self.completed_groups


def extract_metadata_headers_from_markdown(full_markdown_text: str) -> List[Dict[str, Any]]:
    """
    Extracts <page_metadata> or <|page_metadata|> JSON blocks embedded in OCR markdown text.
    """
    pattern = re.compile(r"(?:<\|page_metadata\|>|<page_metadata>)\s*(\{.*?\})\s*(?:<\|end_metadata\|>|</page_metadata>)", re.DOTALL)
    headers = []
    
    for match in pattern.finditer(full_markdown_text):
        json_str = match.group(1).strip()
        try:
            headers.append(json.loads(json_str))
        except Exception:
            pass
            
    return headers


def merge_chunk_xmls(
    chunk_xml_contents: List[str],
    raw_chunk_inputs: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Stitches multiple per-chunk XML sequence-annotated outputs into a single,
    unified 100% annotated XML document, deduplicating boundary questions and stimuli
    across safety-net overlap pages, and pruning hallucinated question tails.
    """
    seen_question_nums = set()
    seen_stimulus_signatures = set()
    deduplicated_count = 0
    merged_lines = []

    for c_idx, raw_xml in enumerate(chunk_xml_contents):
        cleaned_chunk = re.sub(r"<!--\s*Chunk\s*\d+:.*?-->", "", raw_xml).strip()

        # Deduplicate multi-line <stimulus>...</stimulus> blocks across chunk overlap boundaries
        def replace_stim(match):
            nonlocal deduplicated_count
            full_block = match.group(0)
            content = match.group(1).strip()
            sig = re.sub(r"\s+", "", content[:120])
            if sig in seen_stimulus_signatures:
                deduplicated_count += 1
                return ""
            seen_stimulus_signatures.add(sig)
            return full_block

        cleaned_chunk = re.sub(r"<stimulus>(.*?)</stimulus>", replace_stim, cleaned_chunk, flags=re.DOTALL)
        lines = cleaned_chunk.splitlines()
        
        raw_input = raw_chunk_inputs[c_idx] if raw_chunk_inputs and c_idx < len(raw_chunk_inputs) else None
        
        in_skip_block = False

        for line in lines:
            line_s = line.strip()
            if not line_s:
                continue
            
            # Check for question label
            q_match = re.search(r"<question_label>\s*\*\*?(\d{1,4})\.\*\*?\s*</question_label>", line)
            if not q_match:
                # Also match untagged question label e.g. **158.**
                q_match_raw = re.search(r"(?:^|\s)\*\*?(\d{1,4})\.\*\*?\s*", line_s)
                if q_match_raw and not line_s.startswith("<") and not line_s.startswith("#"):
                    q_num = q_match_raw.group(1)
                    if raw_input and f"**{q_num}.**" not in raw_input and f"{q_num}." not in raw_input:
                        # Prune hallucinated tail
                        continue

            if q_match:
                q_num = q_match.group(1)
                # Verify if this question actually exists in raw chunk input (if provided)
                if raw_input and (f"**{q_num}.**" not in raw_input and f"{q_num}." not in raw_input):
                    # Hallucinated question not in raw chunk input
                    deduplicated_count += 1
                    in_skip_block = True
                    continue

                if q_num in seen_question_nums:
                    deduplicated_count += 1
                    in_skip_block = True
                    continue
                else:
                    seen_question_nums.add(q_num)
                    in_skip_block = False

            if in_skip_block:
                if line_s.startswith("<question_label>") or line_s.startswith("<section>") or line_s.startswith("<stimulus>"):
                    in_skip_block = False
                else:
                    continue

            merged_lines.append(line)

    merged_xml = "\n".join(merged_lines)
    all_questions_sorted = sorted(list(seen_question_nums), key=lambda x: int(x))

    return {
        "merged_xml": merged_xml,
        "total_questions": len(seen_question_nums),
        "deduplicated_count": deduplicated_count,
        "chunks_processed": len(chunk_xml_contents),
        "question_range": f"{all_questions_sorted[0]} - {all_questions_sorted[-1]}" if all_questions_sorted else "N/A"
    }
