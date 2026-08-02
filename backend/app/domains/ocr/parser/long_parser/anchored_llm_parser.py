"""
Full LLM Parsing Pipeline with Compact Start/End Text Anchors and Two-Pass Multi-Role Validation.

Architecture:
1. Stable System Prompt defining:
   - Role A — Parser: extracts exam structure and returns compact anchored results.
   - Role B — Validator: reviews Role A's result after first pass and confirms or corrects it.
2. Two-Pass Multi-Turn Execution:
   - Both passes share the exact same stable system prompt and initial user document message,
     preserving the prompt prefix for provider prompt caching.
3. Application-side Anchor Recovery:
   - The LLM returns short start_anchor and end_anchor substrings copied from the source text.
   - The application recovers exact full text (sections, stimuli, stems, options, explanations)
     by resolving anchor boundaries against the original OCR source text.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from backend.app.core.config import PARSER_MODEL, PARSER_PROVIDER
from backend.app.domains.llm.deepseek_client import chat


STABLE_EXAM_PARSER_SYSTEM_PROMPT = """You are an expert educational exam paper parser and validator.

You operate under two distinct execution roles:
- ROLE A (PARSER): Extracts the complete exam structure from raw source text and returns compact anchored results.
- ROLE B (VALIDATOR): Audits Role A's extracted structure, checks for missing items or inaccuracies, and returns the final verified/corrected compact anchored JSON.

## CORE PRINCIPLES & COMPACT ANCHORS:
To minimize token usage and generation latency:
Do NOT reproduce long section text, stimulus passages, stems, or explanations.
Instead, return SHORT start and end anchors copied verbatim from the source text:
- "start_anchor": exact 10-40 character substring from the start of the text.
- "end_anchor": exact 10-40 character substring from the end of the text.
(If an item is short, "start_anchor" and "end_anchor" may be identical or equal to the short text itself).

## JSON SCHEMA SPECIFICATION:
Return ONLY a valid JSON object matching this schema:
{
  "sections": [
    {
      "id": "sec_1",
      "start_anchor": "<first 10-40 chars of section title/instructions>",
      "end_anchor": "<last 10-40 chars of section title/instructions>"
    }
  ],
  "stimuli": [
    {
      "id": "stim_1",
      "start_anchor": "<first 10-40 chars of passage>",
      "end_anchor": "<last 10-40 chars of passage>"
    }
  ],
  "questions": [
    {
      "id": "q_1",
      "question_number": "1",
      "section_id": "sec_1",
      "stimulus_id": "stim_1",
      "stem": {
        "start_anchor": "<first 10-40 chars of stem>",
        "end_anchor": "<last 10-40 chars of stem>"
      },
      "options": [
        {
          "label": "A",
          "start_anchor": "<first 10-40 chars of option A>",
          "end_anchor": "<last 10-40 chars of option A>"
        },
        {
          "label": "B",
          "start_anchor": "<first 10-40 chars of option B>",
          "end_anchor": "<last 10-40 chars of option B>"
        }
      ],
      "correct_answer": "A",
      "explanation": {
        "start_anchor": "<first 10-40 chars of explanation>",
        "end_anchor": "<last 10-40 chars of explanation>"
      }
    }
  ]
}

## ANCHOR RULES:
1. Always copy anchors verbatim from the source text. Do not correct typos or alter characters.
2. Ensure start_anchor is unique enough to locate the beginning of the field.
3. Ensure end_anchor is unique enough to locate the end of the field.
4. Do not omit any question, stem, or option. Every question in the source text must be extracted.

## ROLE INSTRUCTIONS:
When instructed with "### ACTIVATE ROLE A: PARSER":
Extract the complete exam paper and return the compact anchored JSON structure.

When instructed with "### ACTIVATE ROLE B: VALIDATOR":
Review Role A's response against the original source text. Check for missing questions, omitted options, incorrect answer keys, or broken anchors. Return the complete, corrected, and confirmed compact anchored JSON.
"""


def _normalize_text_for_matching(text: str) -> Tuple[str, List[int]]:
    """
    Builds a whitespace-collapsed string and a mapping from normalized indices
    back to original character indices in text.
    """
    norm_chars = []
    index_map = []
    in_space = False

    for orig_idx, ch in enumerate(text):
        if ch.isspace():
            if not in_space:
                norm_chars.append(" ")
                index_map.append(orig_idx)
                in_space = True
        else:
            norm_chars.append(ch)
            index_map.append(orig_idx)
            in_space = False

    norm_text = "".join(norm_chars)
    return norm_text, index_map


def find_anchor_position(
    raw_text: str, anchor: str, cursor: int = 0
) -> Tuple[int, int]:
    """
    Finds exact or normalized character offsets (start, end) of anchor in raw_text.
    Returns (-1, -1) if anchor cannot be resolved.
    """
    if not anchor or not raw_text:
        return -1, -1

    anchor_str = anchor.strip()
    if not anchor_str:
        return -1, -1

    # 1. Direct exact search starting from cursor
    pos = raw_text.find(anchor_str, max(0, cursor))
    if pos != -1:
        return pos, pos + len(anchor_str)

    # 2. Direct exact search from start of text
    pos = raw_text.find(anchor_str, 0)
    if pos != -1:
        return pos, pos + len(anchor_str)

    # 3. Normalized search (collapsing whitespace/newlines)
    norm_text, index_map = _normalize_text_for_matching(raw_text)
    norm_anchor, _ = _normalize_text_for_matching(anchor_str)
    norm_anchor = norm_anchor.strip()

    if not norm_anchor:
        return -1, -1

    norm_pos = norm_text.find(norm_anchor)
    if norm_pos != -1:
        orig_start = index_map[norm_pos]
        norm_end_idx = norm_pos + len(norm_anchor) - 1
        orig_end = index_map[min(norm_end_idx, len(index_map) - 1)] + 1
        return orig_start, orig_end

    # 4. Partial prefix fallback (first 15 chars of anchor)
    if len(anchor_str) > 15:
        short_anchor = anchor_str[:15]
        pos = raw_text.find(short_anchor, max(0, cursor))
        if pos != -1:
            return pos, pos + len(short_anchor)
        pos = raw_text.find(short_anchor, 0)
        if pos != -1:
            return pos, pos + len(short_anchor)

    return -1, -1


def recover_text_from_anchors(
    raw_text: str,
    start_anchor: Optional[Any] = None,
    end_anchor: Optional[str] = None,
    cursor: int = 0,
) -> Tuple[str, int, int]:
    """
    Recovers exact full text from start_anchor and end_anchor.
    Handles anchor objects, strings, or missing anchors gracefully.
    """
    if isinstance(start_anchor, dict):
        end_anchor = start_anchor.get("end_anchor") or end_anchor
        start_anchor = start_anchor.get("start_anchor") or ""

    if not isinstance(start_anchor, str):
        start_anchor = str(start_anchor or "").strip()

    if not start_anchor:
        return "", cursor, cursor

    start_pos, start_end = find_anchor_position(raw_text, start_anchor, cursor)

    if start_pos == -1:
        # Fallback if anchor is not found in text
        return start_anchor, cursor, cursor

    if end_anchor and isinstance(end_anchor, str) and end_anchor.strip():
        end_str = end_anchor.strip()
        end_pos, end_len_pos = find_anchor_position(raw_text, end_str, start_pos)
        if end_pos != -1 and end_len_pos > start_pos:
            recovered = raw_text[start_pos:end_len_pos]
            return recovered, start_pos, end_len_pos

    # No end_anchor or end_anchor not found -> return from start_pos for length of start_anchor
    recovered = raw_text[start_pos:start_end]
    return recovered, start_pos, start_end


def _parse_json_from_llm_response(response_text: str) -> Dict[str, Any]:
    """Extracts JSON object from LLM markdown response."""
    if not response_text or not isinstance(response_text, str):
        return {}

    cleaned = re.sub(r"<think>.*?</think>", "", response_text, flags=re.DOTALL).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    obj_start = cleaned.find("{")
    obj_end = cleaned.rfind("}")
    if obj_start != -1 and obj_end > obj_start:
        try:
            data = json.loads(cleaned[obj_start : obj_end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    return {}


def recover_exam_structure_from_anchors(
    raw_text: str, payload: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Parses LLM compact anchored JSON payload and recovers full texts
    against raw_text for sections, stimuli, stems, options, and explanations.
    """
    sections = payload.get("sections") or []
    stimuli_raw = payload.get("stimuli") or []
    questions_raw = payload.get("questions") or []

    # Recover section texts
    section_map: Dict[str, str] = {}
    cursor = 0
    for sec in sections:
        sec_id = sec.get("id") or f"sec_{len(section_map) + 1}"
        s_anchor = sec.get("start_anchor")
        e_anchor = sec.get("end_anchor")
        text, _, new_cursor = recover_text_from_anchors(
            raw_text, s_anchor, e_anchor, cursor
        )
        section_map[sec_id] = text
        cursor = max(cursor, new_cursor)

    # Recover stimuli texts
    stimuli: Dict[str, str] = {}
    cursor = 0
    for stim in stimuli_raw:
        stim_id = stim.get("id") or f"stim_{len(stimuli) + 1}"
        s_anchor = stim.get("start_anchor")
        e_anchor = stim.get("end_anchor")
        text, _, new_cursor = recover_text_from_anchors(
            raw_text, s_anchor, e_anchor, cursor
        )
        stimuli[stim_id] = text
        cursor = max(cursor, new_cursor)

    # Recover question texts
    questions: List[Dict[str, Any]] = []
    cursor = 0

    for idx, q in enumerate(questions_raw):
        q_id = q.get("id") or f"q_{idx + 1}"
        q_num = str(q.get("question_number") or f"{idx + 1}").strip()
        sec_id = q.get("section_id")
        sec_text = section_map.get(sec_id, "") if sec_id else ""

        stim_id = q.get("stimulus_id")
        stim_text = stimuli.get(stim_id, "") if stim_id else ""

        # Recover stem
        stem_val = q.get("stem")
        stem_text, _, stem_cursor = recover_text_from_anchors(
            raw_text, stem_val, cursor=cursor
        )
        cursor = max(cursor, stem_cursor)

        # Recover options
        options_raw = q.get("options") or []
        recovered_options: List[Dict[str, str]] = []
        for opt in options_raw:
            label = str(opt.get("label") or "").strip()
            opt_text, _, opt_cursor = recover_text_from_anchors(
                raw_text, opt, cursor=cursor
            )
            recovered_options.append({"label": label, "text": opt_text})
            cursor = max(cursor, opt_cursor)

        # Recover explanation
        explanation_val = q.get("explanation")
        explanation_text = ""
        if explanation_val:
            explanation_text, _, exp_cursor = recover_text_from_anchors(
                raw_text, explanation_val, cursor=cursor
            )
            cursor = max(cursor, exp_cursor)

        questions.append(
            {
                "id": q_id,
                "question_number": q_num,
                "stem": stem_text,
                "options": recovered_options,
                "correct_answer": str(q.get("correct_answer") or "").strip(),
                "explanation": explanation_text,
                "stimulus_id": stim_id,
                "stimulus_text": stim_text,
                "section": sec_text,
            }
        )

    return questions, stimuli


class AnchoredLLMExamParser:
    """
    Full LLM exam parser implementing the two-pass multi-role protocol with compact anchors.
    """

    def __init__(self, model: Optional[str] = None, provider: Optional[str] = None):
        self.model = model or PARSER_MODEL
        self.provider = provider or PARSER_PROVIDER

    def parse_exam_chunk(
        self,
        raw_text: str,
        chunk_index: int = 0,
        completion_fn: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """
        Runs Role A (Parser) pass followed by Role B (Validator) pass in the same conversation.
        Recovers exact texts from returned anchors.
        """
        if not raw_text.strip():
            return {
                "questions": [],
                "stimuli": {},
                "role_a_response": "",
                "role_b_response": "",
                "method": "empty",
            }

        complete = completion_fn or chat

        # Pass 1: Role A — Parser
        role_a_prompt = (
            "### ACTIVATE ROLE A: PARSER\n"
            "Extract the complete exam structure with compact anchors from the raw source text below:\n\n"
            "<<<SOURCE_TEXT_START>>>\n"
            f"{raw_text}\n"
            "<<<SOURCE_TEXT_END>>>"
        )

        messages = [
            {"role": "system", "content": STABLE_EXAM_PARSER_SYSTEM_PROMPT},
            {"role": "user", "content": role_a_prompt},
        ]

        role_a_response = complete(
            messages=messages,
            model=self.model,
            provider=self.provider,
        )

        # Pass 2: Role B — Validator (continues conversation in exact same thread)
        role_b_prompt = (
            "### ACTIVATE ROLE B: VALIDATOR\n"
            "Review Role A's extracted structure above against the original source text. "
            "Audit for missing questions, missing options, unlinked stimuli, or inaccurate start/end anchors. "
            "Output the confirmed or corrected final compact anchored JSON."
        )

        messages.append({"role": "assistant", "content": role_a_response or "{}"})
        messages.append({"role": "user", "content": role_b_prompt})

        role_b_response = complete(
            messages=messages,
            model=self.model,
            provider=self.provider,
        )

        # Decode Role B response (fallback to Role A if Role B fails to yield JSON)
        payload = _parse_json_from_llm_response(role_b_response)
        if not payload:
            payload = _parse_json_from_llm_response(role_a_response)

        questions, stimuli = recover_exam_structure_from_anchors(raw_text, payload)

        return {
            "questions": questions,
            "stimuli": stimuli,
            "role_a_response": role_a_response,
            "role_b_response": role_b_response,
            "payload": payload,
            "method": "llm_two_pass_anchored",
        }
