"""
DET + Anchor Parser Worker for Azozo Engine v2.0.

Combines the O(L) deterministic structure parser (deterministic_parser.py) for
questions, stems, and options with the LLM boundary anchor extractor (anchor_extractor.py)
for stimulus passages and section headers.

Provides 100% source text fidelity (0% text hallucination) and millisecond structural
parsing with focused semantic stimulus extraction.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from backend.app.core.config import PARSER_MODEL, PARSER_PROVIDER
from backend.app.domains.ocr.parser.long_parser.old.anchor_extractor import AnchorStructureAgent
from backend.app.domains.ocr.parser.long_parser.old.deterministic_parser import (
    CONFIDENCE_ESCALATION_THRESHOLD,
    parse_chunk_deterministic,
    spans_to_annotated_xml,
)
from backend.app.domains.ocr.parser.parser import parse_spans_into_structured_questions


class DetAnchorParserWorker:
    """
    Hybrid/Deterministic worker combining DET parser and Stimulus Span Extraction.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        confidence_threshold: float = CONFIDENCE_ESCALATION_THRESHOLD,
        use_llm_fallback: bool = True,
    ):
        self.model = model or PARSER_MODEL
        self.provider = provider or PARSER_PROVIDER
        self.confidence_threshold = confidence_threshold
        self.use_llm_fallback = use_llm_fallback
        self.anchor_agent = AnchorStructureAgent(model=self.model, provider=self.provider)
        self._fallback_worker = None

    @property
    def fallback_worker(self):
        if self._fallback_worker is None:
            from backend.app.domains.ocr.parser.long_parser.parser_agent_worker import ParserAgentWorker

            self._fallback_worker = ParserAgentWorker(
                model=self.model, provider=self.provider
            )
        return self._fallback_worker

    def _merge_spans(
        self, det_spans: List[Dict[str, Any]], anchor_spans: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Merge DET structural spans and Anchor stimulus/section spans.
        Resolves collisions by prioritizing anchor stimulus/section boundaries over
        DET section guesses.
        """
        # Exclude DET-generated section spans if AnchorStructureAgent emitted sections
        has_anchor_sections = any(s.get("label") == "section" for s in anchor_spans)
        filtered_det = [
            s
            for s in det_spans
            if not (has_anchor_sections and s.get("label") == "section")
        ]

        combined = filtered_det + anchor_spans

        # Sort spans by character start offset (and longer spans first if same start)
        combined.sort(key=lambda s: (s["start"], -s["end"]))
        return combined

    def process_chunk(
        self,
        raw_chunk_text: str,
        chunk_index: int = 0,
        page_ids: Optional[List[int]] = None,
        overlap_page_ids: Optional[List[int]] = None,
        page_offset_ranges: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Process a single document chunk using DET parser + Anchor stimulus extraction.
        """
        if not raw_chunk_text or not raw_chunk_text.strip():
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

        # Step 1: Run Deterministic Structural Parser
        det_result = parse_chunk_deterministic(raw_chunk_text)

        # Check if fallback to 100% LLM sequence annotation is needed due to low confidence
        if (
            self.use_llm_fallback
            and det_result.confidence < self.confidence_threshold
            and not det_result.spans
        ):
            print(
                f"[DetAnchorWorker] Low DET confidence ({det_result.confidence:.2f}) on chunk {chunk_index}, falling back to LLM annotator..."
            )
            return self.fallback_worker.process_chunk(
                raw_chunk_text,
                chunk_index=chunk_index,
                page_ids=page_ids,
                overlap_page_ids=overlap_page_ids,
                page_offset_ranges=page_offset_ranges,
            )

        # Step 2: Run Anchor Structure Agent for Stimulus & Section Span Extraction
        anchor_result = self.anchor_agent.extract(raw_chunk_text)
        anchor_spans = anchor_result.span_dicts()

        # Step 3: Combine DET structural spans and Anchor stimulus spans
        merged_spans = self._merge_spans(det_result.spans, anchor_spans)

        # Step 4: Parse spans into structured questions & stimuli objects
        structured_questions, raw_stimuli = parse_spans_into_structured_questions(
            raw_chunk_text, merged_spans
        )

        # Step 5: Scope chunk-local IDs globally across chunks
        scoped_stimuli: Dict[str, str] = {}
        stimulus_id_map: Dict[str, str] = {}

        for old_id, text in raw_stimuli.items():
            new_id = (
                old_id
                if old_id.startswith(f"chunk_{chunk_index}_")
                else f"chunk_{chunk_index}_{old_id}"
            )
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
                q["stimulus_text"] = scoped_stimuli.get(
                    mapped_id, q.get("stimulus_text", "")
                )

            q["chunk_index"] = chunk_index

        raw_xml = spans_to_annotated_xml(raw_chunk_text, merged_spans)

        return {
            "chunk_index": chunk_index,
            "raw_chunk_text": raw_chunk_text,
            "spans": merged_spans,
            "page_ids": page_ids or [],
            "overlap_page_ids": overlap_page_ids or [],
            "page_offset_ranges": page_offset_ranges or [],
            "parse_status": "ok",
            "parse_diagnostics": {
                "det_confidence": det_result.confidence,
                "det_diagnostics": det_result.diagnostics,
                "anchor_spans_count": len(anchor_spans),
                "anchor_rejected": len(anchor_result.rejected),
            },
            "questions": structured_questions,
            "stimuli": scoped_stimuli,
            "spans_count": len(merged_spans),
            "recovered_count": 0,
            "method": "det_parser+anchor_extraction",
            "raw_xml": raw_xml,
        }
