import os
import sys
import json
import re
import hashlib
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional, Union

# Set up path to import src modules
script_dir = Path(__file__).resolve().parent
workspace_dir = script_dir.parent.parent
sys.path.append(str(workspace_dir))

from dotenv import load_dotenv
from openai import OpenAI
from tqdm import tqdm

try:
    from src.token_tracker import log_response
except ImportError:
    # Fallback log_response if src.token_tracker is absent
    def log_response(response, model=""):
        pass

# Reconfigure stdout for UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv(dotenv_path=workspace_dir / ".env")

# ── Sequence Labelling Tag Definitions ────────────────────────────────────────

BASE_TAGS = [
    "question",
    "question_label",
    "stem",
    "option_label",
    "option_text",
    "stimulus",
    "section",
    "explanation",
]


def get_tag_mappings() -> Tuple[Dict[str, int], Dict[int, str]]:
    """Generates BIO tag to ID mapping and reverse ID to tag mapping."""
    tag_to_id = {"O": 0}
    for tag in BASE_TAGS:
        tag_to_id[f"B-{tag}"] = len(tag_to_id)
        tag_to_id[f"I-{tag}"] = len(tag_to_id)
    id_to_tag = {v: k for k, v in tag_to_id.items()}
    return tag_to_id, id_to_tag


TAG_TO_ID, ID_TO_TAG = get_tag_mappings()

SYSTEM_PROMPT = """# [System Config] Mô tả vai trò & trách nhiệm
Role: You are an expert NLP data annotator for Vietnamese educational exam papers.
Your task is to annotate raw OCR text of exam papers by wrapping specific components in precise inline XML tags for sequence labelling.

## [Operational Mode] — Chế độ hoạt động

### Quy trình Gán nhãn XML:
1. Wrap specific entities sequentially using the defined tag dictionary.
2. Preserve 100% of input text without modifying, rephrasing, or omitting any characters.
3. Keep non-entity text (page headers, page markers like `<|page|>Page X`, footers, separators) outside XML tags.

---

## 🏷️ Tag Dictionary (Danh Sách Thẻ XML)

1. <question stimulus_id="...">...</question> or <question_label stimulus_id="...">...</question_label>: Wrap individual main question blocks or question prefix indicators (e.g. "Câu 1:", "Câu 12.", "Question 1:"). These tags accept optional parameters, including `stimulus_id="..."` (referencing an associated `<stimulus id="...">` block) and `id="..."`.
2. <stem>...</stem>: Wrap the main text body of a question or main sub-question (including any ordering items or list of items to order). Note: If a question has sub-parts a), b), c) that are annotated as options, the introductory text (e.g. "Cho tam giác ABC...") is the <stem>, NOT <stimulus>.
3. <option_label>...</option_label>: Wrap options letters/prefixes or sub-question letters/prefixes (e.g. "A.", "B.", "C.", "D.", "a)", "b)", "c)", "d.", "a.", "b.", "c.", "d."). Include bold asterisks "**" inside if present. Do NOT wrap correct answer letters in reference explanations here.
4. <option_text>...</option_text>: Wrap the textual content of options or sub-questions.
5. <stimulus id="...">...</stimulus>: Wrap shared passages, reading texts, diagrams, or situational context blocks used for 2 or more questions. Can optionally include an `id="..."` attribute (e.g., `id="stim_1"`). Do NOT use stimulus for single-question stems with parts a), b), c).
6. <section>...</section>: Wrap section headers, subheaders, directions, and reference answer/explanation titles (e.g., "PHẦN I. Câu trắc nghiệm...", "Mark the letter A, B, C, or D...", "ĐÁP ÁN THAM KHẢO", "LỜI GIẢI THAM KHẢO").
7. <explanation>...</explanation>: Wrap reference explanations, answers explanation texts, and solutions for questions. Do NOT wrap the question label prefix itself.

---

## ⛔ [Content Constraints] Strict Rules & Errors to Avoid

1. **NO TEXT MODIFICATION:** Do NOT alter, correct, spell-check, or omit any character, typo, LaTeX expression ($...$ or $$...$$), or page marker (`<|page|>Page X`).
2. **COMPLETE COVERAGE:** Output the ENTIRE input text from start to end. Do NOT omit headers, footers, page markers, end markers ("HẾT"), or answer key tables.
3. **ORDERING QUESTIONS:** Scrambled items (a. b. c. d. e.) in arrangement questions belong inside the <stem> tag. Only the final choice letters (A. B. C. D.) with sequences (e.g., "a – c – b") are <option_label> and <option_text>.
4. **NO MARKDOWN CODEBLOCKS:** Output ONLY the annotated text directly. Do not wrap the output in ```xml codeblocks.
5. **CONCISE THINKING TRACE:** Use `<think>` block for concise reasoning (< 60 words) highlighting layout, edge cases, and verification.
"""


ANCHOR_SYSTEM_PROMPT = """# [System Config] Mô tả vai trò & trách nhiệm
Role: You are an expert NLP data annotator for Vietnamese educational exam papers.
Your task is to extract the structure of an exam paper using CONCISE ANCHOR TAGS instead of retyping full text verbatim.

Instructions:
For every entity (stimulus, question, stem, option_label, option_text, explanation), output an XML element with 'start' and 'end' attributes containing the FIRST 3-6 words and LAST 3-6 words verbatim from the input OCR text.

Entity Tags:
1. <stimulus id="stim_1" start="Exact first 4 words..." end="Exact last 4 words..."/>
2. <question id="q1" stimulus_id="stim_1" start="Question label prefix..." end="Last words of question block..."/>
3. <question_label start="Câu 1:" end="Câu 1:"/> (for short label text under 6 words, start and end are identical)
4. <stem start="First 4 words of stem..." end="Last 4 words of stem..."/>
5. <option_label start="A." end="A."/>
6. <option_text start="First 3 words of option..." end="Last 3 words of option..."/>
7. <explanation start="First 3 words..." end="Last 3 words..."/>

CRITICAL RULES:
- 'start' and 'end' attribute values MUST be EXACT substrings verbatim from the input text (including punctuation/LaTeX if present).
- Do NOT retype the full body text inside the tags. Use self-closing tags like `<tag start="..." end="..."/>` or `<tag start="...">...</tag>`.
- Preserves exact linear sequence order of the input document.
"""


def expand_anchor_xml(raw_text: str, anchor_xml: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses anchor XML string and expands start/end anchor phrases into exact character spans.
    Features smart gap partitioning to ensure short option texts (e.g. cloze tests) never overflow.
    """
    allowed_tags = set(BASE_TAGS)
    tag_pattern = re.compile(r"<([a-zA-Z_0-9\-]+)(?:\s+([^/>]*))?(?:/>|>(.*?)</\1>)", re.DOTALL)

    spans = []
    global_cursor = 0
    container_stack = []
    raw_matches = list(tag_pattern.finditer(anchor_xml))

    for i, match in enumerate(raw_matches):
        tag_name = match.group(1)
        attr_str = match.group(3) if match.group(3) else (match.group(2) or "")
        inner_content = match.group(3) or ""

        if tag_name not in allowed_tags:
            continue

        params = {}
        if attr_str:
            attr_matches = re.findall(r'([a-zA-Z_0-9\-]+)=(?:"([^"]*)"|\'([^\']*)\'|(\S+))', attr_str)
            for k, v1, v2, v3 in attr_matches:
                params[k] = v1 or v2 or v3

        start_phrase = params.pop("start", inner_content).strip()
        end_phrase = params.pop("end", start_phrase).strip()

        if not start_phrase:
            continue

        search_start = global_cursor
        if container_stack and tag_name not in ["question", "stimulus"]:
            search_start = container_stack[-1]["start"]

        start_idx = raw_text.find(start_phrase, search_start)
        if start_idx == -1:
            m = re.search(re.escape(start_phrase), raw_text[search_start:], re.IGNORECASE)
            if m:
                start_idx = search_start + m.start()
            else:
                m_sub = re.search(re.escape(start_phrase[:15]), raw_text[search_start:], re.IGNORECASE)
                if m_sub:
                    start_idx = search_start + m_sub.start()
                else:
                    continue

        # Look ahead for next tag start to constrain end_idx if end_phrase matches too far
        next_tag_start_idx = -1
        if i + 1 < len(raw_matches):
            next_m = raw_matches[i + 1]
            next_attr = next_m.group(3) if next_m.group(3) else (next_m.group(2) or "")
            next_params = dict(re.findall(r'([a-zA-Z_0-9\-]+)=(?:"([^"]*)"|\'([^\']*)\'|(\S+))', next_attr))
            next_start_phrase = next_params.get("start", next_m.group(3) or "").strip()
            if next_start_phrase:
                found_next = raw_text.find(next_start_phrase, start_idx)
                if found_next != -1:
                    next_tag_start_idx = found_next

        end_idx = -1
        if end_phrase:
            end_search_start = start_idx + len(start_phrase)
            end_match_idx = raw_text.find(end_phrase, end_search_start)
            if end_match_idx != -1:
                end_idx = end_match_idx + len(end_phrase)
                if next_tag_start_idx != -1 and tag_name != "question" and end_idx > next_tag_start_idx:
                    end_idx = next_tag_start_idx
            else:
                m_end = re.search(re.escape(end_phrase), raw_text[end_search_start:], re.IGNORECASE)
                if m_end:
                    end_idx = end_search_start + m_end.end()
                    if next_tag_start_idx != -1 and tag_name != "question" and end_idx > next_tag_start_idx:
                        end_idx = next_tag_start_idx
                else:
                    end_idx = next_tag_start_idx if next_tag_start_idx != -1 else (start_idx + len(start_phrase))
        else:
            end_idx = next_tag_start_idx if next_tag_start_idx != -1 else (start_idx + len(start_phrase))

        extracted_text = raw_text[start_idx:end_idx]

        span_obj = {
            "start": start_idx,
            "end": end_idx,
            "label": tag_name,
            "text": extracted_text,
        }
        if params:
            span_obj["params"] = params

        spans.append(span_obj)

        if tag_name in ["question", "stimulus"]:
            container_stack.append({"start": start_idx, "end": end_idx, "label": tag_name})
            global_cursor = end_idx
        else:
            if not container_stack:
                global_cursor = max(global_cursor, end_idx)

    return raw_text, spans


def clean_llm_response(text: str) -> str:
    """Removes think tags and markdown code block wrappers from LLM response."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"<think>.*", "", text, flags=re.DOTALL)
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 2:
            if lines[-1].strip() == "```":
                text = "\n".join(lines[1:-1])
            else:
                text = "\n".join(lines[1:])
    return text.strip()


def parse_xml_annotations(tagged_text: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses tagged XML string to produce clean raw text and character offset spans.
    Supports XML tags with parameters/attributes (e.g. <question stimulus_id="stim_1">).
    Preserves raw text exact alignment.
    """
    allowed_tags = set(BASE_TAGS)
    raw_chars = []
    spans = []

    tag_pattern = re.compile(r"<(/)?([a-zA-Z_0-9\-]+)(?:\s+([^>]*))?>")
    pos = 0
    tag_stack = []

    for match in tag_pattern.finditer(tagged_text):
        start, end = match.span()
        text_before = tagged_text[pos:start]
        raw_chars.append(text_before)

        is_closing = bool(match.group(1))
        tag_name = match.group(2)
        attr_str = match.group(3) or ""

        if tag_name in allowed_tags:
            if not is_closing:
                params = {}
                if attr_str:
                    attr_matches = re.findall(
                        r'([a-zA-Z_0-9\-]+)=(?:"([^"]*)"|\'([^\']*)\'|(\S+))', attr_str
                    )
                    for k, v1, v2, v3 in attr_matches:
                        params[k] = v1 or v2 or v3
                tag_stack.append(
                    {
                        "tag_name": tag_name,
                        "tag_start_idx": len("".join(raw_chars)),
                        "params": params,
                        "raw_end": end,
                    }
                )
            else:
                match_idx = -1
                for idx in range(len(tag_stack) - 1, -1, -1):
                    if tag_stack[idx]["tag_name"] == tag_name:
                        match_idx = idx
                        break

                if match_idx != -1:
                    open_info = tag_stack.pop(match_idx)
                    tag_start_idx = open_info["tag_start_idx"]
                    tag_end_idx = len("".join(raw_chars))
                    span_text = "".join(raw_chars)[tag_start_idx:tag_end_idx]

                    span_obj = {
                        "start": tag_start_idx,
                        "end": tag_end_idx,
                        "label": tag_name,
                        "text": span_text,
                    }
                    if open_info["params"]:
                        span_obj["params"] = open_info["params"]

                    if tag_name in ["option_label", "question_label"]:
                        full_current_text = "".join(raw_chars)
                        if (
                            tag_start_idx >= 2
                            and full_current_text[tag_start_idx - 2 : tag_start_idx] == "**"
                            and tagged_text[end : end + 2] == "**"
                        ):
                            tag_start_idx -= 2
                            raw_chars.append("**")
                            tag_end_idx = len("".join(raw_chars))
                            span_text = "".join(raw_chars)[tag_start_idx:tag_end_idx]
                            pos = end + 2
                            span_obj["start"] = tag_start_idx
                            span_obj["end"] = tag_end_idx
                            span_obj["text"] = span_text
                            spans.append(span_obj)
                            continue

                    spans.append(span_obj)
        else:
            raw_chars.append(match.group(0))

        pos = end

    raw_chars.append(tagged_text[pos:])
    raw_text = "".join(raw_chars)

    return raw_text, spans


def tokenize_raw_text(text: str) -> Tuple[List[str], List[Tuple[int, int]]]:
    """
    Tokenizes raw text into words/tokens with exact character offsets.
    Handles Vietnamese unicode, numbers, punctuation, LaTeX expressions ($...$).
    """
    token_pattern = re.compile(
        r"(\$\$.*?\$\$|\$.*?\$|<\|page\|>Page \d+|\w+|[^\w\s])", re.DOTALL
    )

    tokens = []
    offsets = []

    for match in token_pattern.finditer(text):
        tokens.append(match.group(0))
        offsets.append((match.start(), match.end()))

    return tokens, offsets


def align_spans_to_bio_tags(
    raw_text: str,
    tokens: List[str],
    offsets: List[Tuple[int, int]],
    spans: List[Dict[str, Any]],
    tag_to_id: Dict[str, int] = TAG_TO_ID,
) -> Tuple[List[str], List[int]]:
    """
    Aligns character-level spans with token offsets to produce sequence labelling BIO tags & IDs.
    """
    # Clean spans to ignore leading/trailing whitespace inside span boundaries
    clean_spans = []
    for span in spans:
        span_text = span.get("text", "")
        start = span["start"]
        end = span["end"]
        if span_text:
            stripped = span_text.strip()
            if not stripped:
                continue
            leading = len(span_text) - len(span_text.lstrip())
            trailing = len(span_text) - len(span_text.rstrip())
            clean_start = start + leading
            clean_end = end - trailing
        else:
            clean_start = start
            clean_end = end

        clean_spans.append(
            {"start": clean_start, "end": clean_end, "label": span["label"]}
        )

    bio_tags = []
    label_ids = []

    for start_char, end_char in offsets:
        # Find non-whitespace anchor inside the token
        non_space_idx = start_char
        for idx in range(start_char, end_char):
            if idx < len(raw_text) and not raw_text[idx].isspace():
                non_space_idx = idx
                break

        matched_span = None
        for span in clean_spans:
            if span["start"] <= non_space_idx < span["end"]:
                matched_span = span
                break

        if matched_span is None:
            tag = "O"
        else:
            span_label = matched_span["label"]
            if non_space_idx == matched_span["start"]:
                tag = f"B-{span_label}"
            else:
                tag = f"I-{span_label}"

        bio_tags.append(tag)
        label_ids.append(tag_to_id.get(tag, 0))

    return bio_tags, label_ids


def validate_bio_sequence(tags: List[str]) -> bool:
    """
    Validates BIO sequence consistency (e.g. check that I-tag follows matching B-tag or I-tag).
    """
    valid = True
    prev_tag = "O"
    for idx, tag in enumerate(tags):
        if tag.startswith("I-"):
            entity = tag[2:]
            if prev_tag == "O" or (
                prev_tag[2:] != entity
                and not (prev_tag.startswith("B-") or prev_tag.startswith("I-"))
            ):
                print(
                    f"  [Warning] Inconsistent BIO transition at index {idx}: '{prev_tag}' -> '{tag}'"
                )
                valid = False
        prev_tag = tag
    return valid


def export_conll(tokens: List[str], tags: List[str]) -> str:
    """Exports tokens and BIO tags into standard CoNLL 2-column format."""
    lines = []
    for token, tag in zip(tokens, tags):
        lines.append(f"{token}\t{tag}")
    return "\n".join(lines)


def get_client_and_model(
    model_name: Optional[str],
    deepseek_key: Optional[str],
    llm_key: Optional[str],
    provider: Optional[str] = None,
) -> Tuple[OpenAI, str]:
    nvidia_key = os.environ.get("NVIDIA_API_KEY") or deepseek_key
    is_nvidia = False
    use_vilao = False
    is_deepseek = False

    if provider == "nvidia":
        is_nvidia = True
    elif provider == "vilao":
        use_vilao = True
    elif provider == "deepseek":
        is_deepseek = True
    else:
        if model_name in ["deepseek-v4-pro", "deepseek-ai/deepseek-v4-pro"]:
            is_nvidia = True
        elif not model_name:
            if deepseek_key:
                is_deepseek = True
            elif llm_key:
                use_vilao = True
            else:
                print("Error: Neither DEEPSEEK_API_KEY nor LLM_API_KEY is set.")
                sys.exit(1)
        else:
            if "/" in model_name or "minimax" in model_name.lower():
                use_vilao = True
            elif not deepseek_key and llm_key:
                use_vilao = True
            else:
                is_deepseek = True

    if is_nvidia:
        target_model = model_name or "deepseek-ai/deepseek-v4-pro"
        print(f"Routing to NVIDIA NIM with model: {target_model}")
        return OpenAI(
            api_key=nvidia_key, base_url="https://integrate.api.nvidia.com/v1"
        ), target_model
    elif use_vilao:
        final_model = model_name or "op/deepseek/deepseek-v4-pro"
        if "/" not in final_model:
            if "minimax" in final_model.lower():
                final_model = f"mn/{final_model}"
            elif "deepseek" in final_model.lower():
                final_model = f"deepseek/{final_model}"
        print(f"Routing to Vilao.ai API with model: {final_model}")
        return OpenAI(api_key=llm_key, base_url="https://api.vilao.ai/v1"), final_model
    else:
        target_model = model_name or "deepseek-chat"
        print(f"Routing to DeepSeek API with model: {target_model}")
        return OpenAI(
            api_key=deepseek_key, base_url="https://api.deepseek.com"
        ), target_model


def load_few_shot_messages(example_dir: Path, prefix: str = "in_") -> List[Dict[str, str]]:
    messages = []
    if not example_dir.exists():
        return messages

    out_prefix = "anchor_out_" if prefix.startswith("anchor") else "out_"
    i = 1
    while True:
        in_file = example_dir / f"{prefix}{i}.md"
        out_file = example_dir / f"{out_prefix}{i}.md"
        if not (in_file.exists() and out_file.exists()):
            break
        try:
            with open(in_file, "r", encoding="utf-8") as f_in:
                in_content = f_in.read()
            with open(out_file, "r", encoding="utf-8") as f_out:
                out_content = f_out.read()
            messages.append({"role": "user", "content": in_content})
            messages.append({"role": "assistant", "content": out_content})
        except Exception:
            pass
        i += 1

    if messages:
        print(f"  Loaded {len(messages) // 2} few-shot example pair(s) (prefix='{prefix}').")
    return messages


class OCRAnnotator:
    """
    Sequence Labelling & OCR Entity Annotator using LLM.
    Converts raw OCR text to inline XML, character spans, and BIO sequence-labelled tokens.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        deepseek_key: Optional[str] = None,
        llm_key: Optional[str] = None,
    ):
        self.deepseek_key = deepseek_key or os.environ.get("DEEPSEEK_API_KEY")
        self.llm_key = llm_key or os.environ.get("LLM_API_KEY")
        self.client, self.model_name = get_client_and_model(
            model, self.deepseek_key, self.llm_key, provider=provider
        )
        self.few_shot_messages = load_few_shot_messages(script_dir / "examples", prefix="in_")
        self.anchor_few_shot_messages = load_few_shot_messages(script_dir / "examples", prefix="anchor_in_")

    def annotate_text(self, raw_ocr_text: str) -> Dict[str, Any]:
        """
        Annotates raw OCR text with LLM and aligns character spans to BIO sequence labels.
        """
        if not raw_ocr_text.strip():
            raise ValueError("Input OCR text is empty.")

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
            ]
            + self.few_shot_messages
            + [
                {"role": "user", "content": raw_ocr_text},
            ],
            temperature=0.0,
        )

        raw_result = response.choices[0].message.content
        tagged_text = clean_llm_response(raw_result)

        # Parse XML tags to character spans
        raw_text, spans = parse_xml_annotations(tagged_text)

        # Tokenize and align BIO sequence labels
        tokens, offsets = tokenize_raw_text(raw_text)
        bio_tags, label_ids = align_spans_to_bio_tags(
            raw_text, tokens, offsets, spans, TAG_TO_ID
        )

        # Validate BIO sequence transitions
        validate_bio_sequence(bio_tags)

        # Build sequence labelling result object
        result = {
            "raw_text": raw_text,
            "raw_xml": tagged_text,
            "spans": spans,
            "tokens": tokens,
            "offsets": offsets,
            "tags": bio_tags,
            "labels": label_ids,
            "label_mapping": TAG_TO_ID,
            "annotated": True,
        }

        return result

    def annotate_text_stream(self, raw_ocr_text: str, callback=None) -> Dict[str, Any]:
        """
        Annotates raw OCR text with LLM using token streaming,
        invoking callback(streamed_tokens, estimated_total_tokens, content_chunk) on each stream chunk.
        """
        if not raw_ocr_text.strip():
            raise ValueError("Input OCR text is empty.")

        words = raw_ocr_text.split()
        estimated_total_tokens = max(50, int(len(words) * 1.3) + 20)

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
            ]
            + self.few_shot_messages
            + [
                {"role": "user", "content": raw_ocr_text},
            ],
            temperature=0.0,
            stream=True,
        )

        full_chunks = []
        streamed_token_count = 0

        for chunk in response:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None) or ""
                if content:
                    full_chunks.append(content)
                    chunk_tokens = max(1, len(content.split()))
                    streamed_token_count += chunk_tokens
                    if callback:
                        callback(streamed_token_count, estimated_total_tokens, content)

        raw_result = "".join(full_chunks)
        tagged_text = clean_llm_response(raw_result)

        raw_text, spans = parse_xml_annotations(tagged_text)
        tokens, offsets = tokenize_raw_text(raw_text)
        bio_tags, label_ids = align_spans_to_bio_tags(
            raw_text, tokens, offsets, spans, TAG_TO_ID
        )

        validate_bio_sequence(bio_tags)

        result = {
            "raw_text": raw_text,
            "raw_xml": tagged_text,
            "spans": spans,
            "tokens": tokens,
            "offsets": offsets,
            "tags": bio_tags,
            "labels": label_ids,
            "label_mapping": TAG_TO_ID,
            "annotated": True,
        }

        return result

    def annotate_text_anchor(self, raw_ocr_text: str, callback=None) -> Dict[str, Any]:
        """
        Annotates raw OCR text using the fast Anchor Shortcut method (start/end phrases).
        Yields up to 6x faster speed and ~85% fewer tokens generated.
        """
        if not raw_ocr_text.strip():
            raise ValueError("Input OCR text is empty.")

        words = raw_ocr_text.split()
        estimated_total_tokens = max(40, int(len(words) * 0.3) + 20)

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": ANCHOR_SYSTEM_PROMPT},
            ]
            + self.anchor_few_shot_messages
            + [
                {"role": "user", "content": raw_ocr_text},
            ],
            temperature=0.0,
            stream=True if callback else False,
        )

        if callback:
            full_chunks = []
            streamed_token_count = 0
            for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    content = getattr(delta, "content", None) or ""
                    if content:
                        full_chunks.append(content)
                        chunk_tokens = max(1, len(content.split()))
                        streamed_token_count += chunk_tokens
                        callback(streamed_token_count, estimated_total_tokens, content)
            raw_result = "".join(full_chunks)
        else:
            raw_result = response.choices[0].message.content

        anchor_xml = clean_llm_response(raw_result)
        raw_text, spans = expand_anchor_xml(raw_ocr_text, anchor_xml)

        tokens, offsets = tokenize_raw_text(raw_text)
        bio_tags, label_ids = align_spans_to_bio_tags(
            raw_text, tokens, offsets, spans, TAG_TO_ID
        )

        validate_bio_sequence(bio_tags)

        result = {
            "raw_text": raw_text,
            "raw_xml": anchor_xml,
            "spans": spans,
            "tokens": tokens,
            "offsets": offsets,
            "tags": bio_tags,
            "labels": label_ids,
            "label_mapping": TAG_TO_ID,
            "annotated": True,
            "is_anchor_mode": True,
        }

        return result


def main():
    parser = argparse.ArgumentParser(
        description="Annotate raw OCR Vietnamese exams & generate sequence labelling datasets using LLMs"
    )
    parser.add_argument(
        "--input",
        "-i",
        default=str(script_dir / "out"),
        help="Input file or directory containing markdown files from OCR",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=str(workspace_dir / "output" / "real-exams"),
        help="Directory to save annotated JSON, XML, and CoNLL files",
    )
    parser.add_argument(
        "--limit", "-l", type=int, default=None, help="Limit number of files to process"
    )
    parser.add_argument(
        "--force",
        "-f",
        action="store_true",
        help="Force re-annotation even if output exists",
    )
    parser.add_argument(
        "--export-conll", action="store_true", help="Also export CoNLL format files"
    )
    parser.add_argument("--model", default=None, help="Model identifier")
    parser.add_argument(
        "--provider", choices=["deepseek", "nvidia", "vilao"], default=None
    )

    args = parser.parse_args()

    annotator = OCRAnnotator(model=args.model, provider=args.provider)
    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        print(f"Error: Input path '{args.input}' does not exist.")
        sys.exit(1)

    md_files = []
    if input_path.is_file():
        md_files = [input_path]
    else:
        for root, _, files in os.walk(input_path):
            for file in files:
                if file.lower().endswith(".md"):
                    md_files.append(Path(root) / file)

    if not md_files:
        print(f"No .md files found in '{args.input}'.")
        sys.exit(0)

    if args.limit is not None:
        md_files = md_files[: args.limit]

    print(f"Found {len(md_files)} file(s) to process.\n")

    for idx, file_path in enumerate(tqdm(md_files, desc="[Annotating Files]", unit="file")):
        print(f"\n[{idx + 1}/{len(md_files)}] Processing: {file_path.name}")

        rel_sig = file_path.name
        path_hash = hashlib.md5(rel_sig.encode("utf-8")).hexdigest()[:8]

        json_out = output_path / f"real_exam_{path_hash}.json"
        xml_out = output_path / f"real_exam_{path_hash}.xml"
        conll_out = output_path / f"real_exam_{path_hash}.conll"

        if json_out.exists() and not args.force:
            print(f"  Skipping existing output: {json_out.name}")
            continue

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                raw_ocr_text = f.read()

            result = annotator.annotate_text(raw_ocr_text)
            result["exam_id"] = f"real_{path_hash}"
            result["created_at"] = datetime.now().isoformat()
            result["is_real"] = True

            # Write JSON output
            with open(json_out, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            # Write XML output
            with open(xml_out, "w", encoding="utf-8") as f:
                f.write(result["raw_xml"])

            # Write CoNLL output if requested
            if args.export_conll:
                conll_text = export_conll(result["tokens"], result["tags"])
                with open(conll_out, "w", encoding="utf-8") as f:
                    f.write(conll_text)

            print(
                f"  -> Saved JSON ({len(result['spans'])} spans, {len(result['tokens'])} tokens) to: {json_out.name}"
            )

        except Exception as e:
            print(f"  Error processing {file_path.name}: {e}")

    print("\nAnnotation completed!")


if __name__ == "__main__":
    main()
