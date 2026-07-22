from typing import Dict, Any, List, Optional
from backend.real_data_annotator.annotate_ocr import OCRAnnotator
from backend.app.services.parser import parse_spans_into_structured_questions, regex_parse_questions

class ParserAgentWorker:
    """
    Parser Agent Worker utilizing existing annotate_ocr.py and parser.py stack.
    Extracts structured questions from raw chunk text without attempting distant graph linking.
    """
    def __init__(self, model: Optional[str] = None, provider: Optional[str] = None):
        self.model = model
        self.provider = provider
        self.annotator = OCRAnnotator(model=model, provider=provider)

    def process_chunk(self, raw_chunk_text: str, chunk_index: int = 0) -> Dict[str, Any]:
        """
        Process a single document chunk into structured questions and stimuli blocks.
        """
        if not raw_chunk_text.strip():
            return {"questions": [], "stimuli": {}, "method": "empty"}

        try:
            # 1. Run LLM XML sequence annotation via annotate_ocr.py
            annotation_res = self.annotator.annotate_text(raw_chunk_text)
            
            # 2. Parse character spans into structured question objects via parser.py
            structured_questions, stimuli = parse_spans_into_structured_questions(
                annotation_res["raw_text"], annotation_res["spans"]
            )

            # Assign chunk-scoped composite IDs if missing
            for idx, q in enumerate(structured_questions):
                if not q.get("id") or q["id"].startswith("q_"):
                    q["id"] = f"chunk_{chunk_index}_q_{idx + 1}"
                q["chunk_index"] = chunk_index

            return {
                "questions": structured_questions,
                "stimuli": stimuli,
                "spans_count": len(annotation_res.get("spans", [])),
                "method": "llm_xml"
            }

        except Exception as e:
            # 3. Fallback to zero-cost regex parser on LLM error
            print(f"[Parser Worker Chunk {chunk_index} Fallback] LLM XML parsing failed ({e}), using regex parser.")
            structured_questions = regex_parse_questions(raw_chunk_text)
            for idx, q in enumerate(structured_questions):
                q["id"] = f"chunk_{chunk_index}_q_regex_{idx + 1}"
                q["chunk_index"] = chunk_index

            return {
                "questions": structured_questions,
                "stimuli": {},
                "spans_count": 0,
                "method": "regex_fallback"
            }
