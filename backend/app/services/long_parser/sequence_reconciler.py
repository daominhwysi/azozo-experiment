import json
import re
from typing import List, Dict, Any

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
    Extracts <|page_metadata|> JSON blocks embedded in OCR markdown text.
    """
    pattern = re.compile(r"<\|page_metadata\|>\s*(\{.*?\})\s*<\|end_metadata\|>", re.DOTALL)
    headers = []
    
    for match in pattern.finditer(full_markdown_text):
        json_str = match.group(1).strip()
        try:
            headers.append(json.loads(json_str))
        except Exception:
            pass
            
    return headers
