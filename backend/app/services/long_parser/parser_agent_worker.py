import re
import time
from typing import Dict, Any, List, Optional

from backend.real_data_annotator.annotate_ocr import OCRAnnotator
from backend.app.services.parser import parse_spans_into_structured_questions


_ALLOWED_XML_TAGS = {
    "section",
    "stimulus",
    "question",
    "question_label",
    "stem",
    "option_label",
    "option_text",
    "explanation",
}


class ParserAgentWorker:
    """
    Parser Agent Worker utilizing existing annotate_ocr.py and parser.py stack.
    Extracts structured questions from raw chunk text using 100% LLM sequence annotation.
    """
    def __init__(self, model: Optional[str] = None, provider: Optional[str] = None):
        self.model = model
        self.provider = provider
        self.max_attempts = 2
        try:
            self.annotator = OCRAnnotator(model=model, provider=provider)
            self.annotator_ready = True
        except Exception as e:
            print(f"[ParserAgentWorker] OCRAnnotator init warning: {e}.")
            self.annotator = None
            self.annotator_ready = False

    @staticmethod
    def _normalize_text_for_comparison(text: str) -> str:
        return re.sub(r"[\s\-\*\#]+", "", text or "")

    @staticmethod
    def _is_valid_annotation_xml(raw_ocr_text: str, raw_xml: str) -> bool:
        if not raw_xml:
            return False

        # remove service markers and comments
        normalized_xml = raw_xml.replace("<|END|>", "")
        normalized_xml = re.sub(r"<\|[^>]*\|>", "", normalized_xml)
        normalized_xml = normalized_xml.strip()

        if not normalized_xml:
            return False

        tag_re = re.compile(r"</?([a-zA-Z_][a-zA-Z0-9_]*)>")
        stack: List[str] = []
        for match in tag_re.finditer(normalized_xml):
            full_tag = match.group(0)
            tag_name = match.group(1).strip()

            if tag_name not in _ALLOWED_XML_TAGS:
                continue

            if full_tag.startswith("</"):
                if not stack or stack[-1] != tag_name:
                    return False
                stack.pop()
            else:
                stack.append(tag_name)

        return len(stack) == 0

    def process_chunk(self, raw_chunk_text: str, chunk_index: int = 0) -> Dict[str, Any]:
        """
        Process a single document chunk into structured questions and stimuli blocks via 100% LLM sequence annotation.
        """
        if not raw_chunk_text.strip():
            return {"questions": [], "stimuli": {}, "method": "empty", "raw_xml": ""}

        if not self.annotator_ready or self.annotator is None:
            raise RuntimeError("LLM annotator unavailable")

        annotation_res = {}
        tagged_text = ""

        for attempt in range(1, self.max_attempts + 1):
            try:
                annotation_res = (
                    self.annotator.annotate_text_stream(raw_chunk_text)
                    if attempt == 1
                    else self.annotator.annotate_text(raw_chunk_text)
                )
                tagged_text = annotation_res.get("raw_xml") or annotation_res.get("tagged_text", "")

                if not self._is_valid_annotation_xml(raw_chunk_text, tagged_text):
                    raise ValueError("Invalid or malformed XML annotation output.")

                # Parse character spans into structured objects
                structured_questions, stimuli = parse_spans_into_structured_questions(
                    annotation_res["raw_text"], annotation_res.get("spans", [])
                )
                method = "llm_xml"
                break
            except Exception as e:
                print(f"[Parser Worker Warning] LLM annotation attempt {attempt} failed for chunk_{chunk_index}: {e}")
                if attempt >= self.max_attempts:
                    raise RuntimeError(
                        f"LLM annotation failed after {self.max_attempts} attempts for chunk_{chunk_index}: {e}"
                    ) from e
                time.sleep(0.5 * attempt)

        # Ensure chunk-local IDs are globally unique across chunks.
        scoped_stimuli: Dict[str, str] = {}
        stimulus_id_map: Dict[str, str] = {}

        for old_id, text in stimuli.items():
            if old_id.startswith(f"chunk_{chunk_index}_"):
                new_id = old_id
            else:
                new_id = f"chunk_{chunk_index}_{old_id}"
            scoped_stimuli[new_id] = text
            if old_id != new_id:
                stimulus_id_map[old_id] = new_id

        for idx, q in enumerate(structured_questions):
            base_id = q.get("id") or f"q_{idx + 1}"
            if not str(base_id).startswith(f"chunk_{chunk_index}_"):
                base_id = f"chunk_{chunk_index}_{base_id}"
            q["id"] = base_id

            stim_id = q.get("stimulus_id")
            if stim_id:
                mapped_id = stimulus_id_map.get(stim_id, stim_id)
                if not str(mapped_id).startswith(f"chunk_{chunk_index}_"):
                    mapped_id = f"chunk_{chunk_index}_{mapped_id}"
                q["stimulus_id"] = mapped_id
                q["stimulus_text"] = scoped_stimuli.get(mapped_id, q.get("stimulus_text", ""))

            q["chunk_index"] = chunk_index

        # Audit and recover untagged questions via SequenceValidatorAgent
        from backend.app.services.long_parser.validator_agent import SequenceValidatorAgent
        validator = SequenceValidatorAgent()

        active_stim_id = list(scoped_stimuli.keys())[-1] if scoped_stimuli else None
        repaired_questions, recovered_count = validator.repair_chunk_questions(
            raw_chunk_text=raw_chunk_text,
            parsed_questions=structured_questions,
            chunk_index=chunk_index,
            active_stimulus_id=active_stim_id
        )

        if recovered_count > 0:
            method = f"{method}+validator_repaired({recovered_count})"

        return {
            "questions": repaired_questions,
            "stimuli": scoped_stimuli,
            "spans_count": len(annotation_res.get("spans", [])),
            "recovered_count": recovered_count,
            "method": method,
            "raw_xml": tagged_text
        }
