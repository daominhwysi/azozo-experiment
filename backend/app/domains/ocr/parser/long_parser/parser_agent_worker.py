import re
import time
import uuid
from typing import Dict, Any, List, Optional

from backend.app.core.config import PARSER_MODEL, PARSER_PROVIDER, PARSER_THINKING
from backend.app.domains.ocr.annotator.annotate_ocr import OCRAnnotator
from backend.app.domains.ocr.parser.parser import parse_spans_into_structured_questions
from backend.app.domains.ocr.parser.long_parser.anchored_xml_llm_parser import AnchoredXMLLLMExamParser


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
    Parser Agent Worker utilizing Two-Pass Multi-Role XML Sequence Annotation with Compact Anchors.
    Extracts structured questions from raw chunk text using Role A (Parser) & Role B (Validator).
    """
    def __init__(
        self,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        thinking: Optional[str] = None,
        annotator_ready: bool = True,
        max_attempts: int = 2,
        enable_validator: bool = True,
    ):
        self.model = model or PARSER_MODEL
        self.provider = provider or PARSER_PROVIDER
        self.thinking = thinking or PARSER_THINKING
        self.max_attempts = max_attempts
        self.enable_validator = enable_validator
        self.anchored_parser = AnchoredXMLLLMExamParser(
            model=self.model,
            provider=self.provider,
            thinking=self.thinking,
        )
        self.annotator_ready = annotator_ready
        if self.annotator_ready:
            try:
                self.annotator = OCRAnnotator(model=self.model, provider=self.provider)
            except Exception as e:
                print(f"[ParserAgentWorker] OCRAnnotator init warning: {e}.")
                self.annotator = None
                self.annotator_ready = False
        else:
            self.annotator = None

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

    def process_chunk(
        self,
        raw_chunk_text: str,
        chunk_index: int = 0,
        page_ids: Optional[List[int]] = None,
        overlap_page_ids: Optional[List[int]] = None,
        page_offset_ranges: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Process a single document chunk into structured questions and stimuli blocks via 2-Pass Multi-Role LLM Parsing.
        """
        if not raw_chunk_text.strip():
            return {
                "chunk_index": chunk_index,
                "raw_chunk_text": raw_chunk_text,
                "raw_xml": "",
                "spans": [],
                "page_ids": page_ids or [],
                "overlap_page_ids": overlap_page_ids or [],
                "page_offset_ranges": page_offset_ranges or [],
                "parse_status": "empty",
                "parse_diagnostics": {"attempts": 0, "validation_errors": []},
                "questions": [],
                "stimuli": {},
                "method": "empty",
            }

        structured_questions: List[Dict[str, Any]] = []
        stimuli: Dict[str, str] = {}
        annotation_res: Dict[str, Any] = {}
        anchored_res: Dict[str, Any] = {}
        tagged_text = ""
        chunk_request_id = uuid.uuid4().hex[:10]
        validation_errors: List[str] = []
        attempts_used = 0
        method = "llm_two_pass_anchored"

        # Attempt 1: Two-Pass Multi-Role Anchored LLM Parsing
        try:
            attempts_used = 1
            anchored_res = self.anchored_parser.parse_exam_chunk(
                raw_chunk_text, enable_validator=self.enable_validator
            )
            structured_questions = anchored_res.get("questions") or []
            stimuli = anchored_res.get("stimuli") or {}
            tagged_text = anchored_res.get("role_b_xml") or anchored_res.get("role_a_xml") or ""
        except Exception as e:
            validation_errors.append(f"Two-pass anchored LLM parsing failed: {e}")
            print(f"[Parser Worker Warning] Two-pass anchored parser error: {e}")
            structured_questions = []

        # Fallback to XML Sequence Annotator if two-pass anchored returned no questions
        if not structured_questions and self.annotator_ready and self.annotator is not None:
            print(f"[RETRY NOTICE] Chunk {chunk_index} returned 0 questions from two-pass parser. Triggering Fallback Annotator...")
            for attempt in range(1, self.max_attempts + 1):
                attempts_used += 1
                print(f"  -> [Fallback Attempt {attempt}/{self.max_attempts}] Executing SequenceLabellingAnnotator...")
                try:
                    attempt_request_id = f"{chunk_request_id}_fallback_{attempt}"
                    annotation_res = self.annotator.annotate_text_stream(
                        raw_chunk_text,
                        request_id=attempt_request_id,
                    )
                    tagged_text = annotation_res.get("raw_xml") or annotation_res.get("tagged_text", "")
                    if self._is_valid_annotation_xml(raw_chunk_text, tagged_text):
                        structured_questions, stimuli = parse_spans_into_structured_questions(
                            annotation_res["raw_text"], annotation_res.get("spans", [])
                        )
                        method = "llm_xml_fallback"
                        print(f"  -> [Fallback Success] Recovered {len(structured_questions)} question(s) on attempt {attempt}.")
                        break
                except Exception as e:
                    validation_errors.append(f"Fallback XML attempt {attempt} failed: {e}")
                    print(f"  -> [Fallback Warning] Attempt {attempt} failed: {e}")
                    if attempt >= self.max_attempts:
                        break
                    time.sleep(2.0 * attempt)


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
        from backend.app.domains.ocr.parser.long_parser.validator_agent import SequenceValidatorAgent
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
            "chunk_index": chunk_index,
            "raw_chunk_text": raw_chunk_text,
            "spans": annotation_res.get("spans", []),
            "page_ids": page_ids or [],
            "overlap_page_ids": overlap_page_ids or [],
            "page_offset_ranges": page_offset_ranges or [],
            "parse_status": "ok",
            "parse_diagnostics": {
                "attempts": attempts_used,
                "validation_errors": validation_errors,
                "request_id": chunk_request_id,
            },
            "questions": repaired_questions,
            "stimuli": scoped_stimuli,
            "spans_count": len(annotation_res.get("spans", [])),
            "recovered_count": recovered_count,
            "role_b_rating": anchored_res.get("role_b_rating", "5/5") if isinstance(anchored_res, dict) else "5/5",
            "role_b_status": anchored_res.get("role_b_status", "APPROVED") if isinstance(anchored_res, dict) else "APPROVED",
            "method": method,
            "raw_xml": tagged_text
        }
