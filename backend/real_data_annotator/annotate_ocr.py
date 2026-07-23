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

from backend.app.config import PARSER_MODEL, PARSER_PROVIDER, PARSER_THINKING

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

SYSTEM_PROMPT = """# [System Config]
Role: You are an expert NLP sequence annotator for educational exam papers (TOEIC, SAT, High School Exams).
Your task is to annotate raw OCR text of exam papers by wrapping specific components in precise inline XML tags for sequence labelling.

## 🏷️ Tag Dictionary:

1. <section>...</section>: Wrap ONLY major section/part titles and part directions that actually separate part to part (e.g., "PART 1", "PART I", "PART N", "PHẦN I", "PHẦN II", "PHần III", "PHẦN I: Từ câu 1 đến câu 20. Mỗi câu hỏi chỉ chọn đúng một phương án.", "PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu 8...", or part instructions such as "Mark the letter A, B, C, or D on your answer sheet to indicate the word that differs from the rest in the pronunciation of the underlined part in each of the following questions."). Ignore every kind of document title, exam header, page header, or non-part header. We ONLY tag text that actually separates one part of the exam from another.
2. <stimulus>...</stimulus>: Wrap shared reading passages, articles, emails, letters, notices, text-message chains, tables, and passage headers (e.g., "Questions 131-134 refer to the following advertisement."). SINGLE STIMULUS GROUPING RULE: When multiple memos, emails, letters, articles, or passages belong to the SAME group of questions (e.g. multi-passage sets like "Questions 176-180 refer to the following email and letter"), wrap the ENTIRE group of passages/memos/emails and their header together in ONE SINGLE contiguous <stimulus>...</stimulus> block. Do NOT split multiple memos, emails, or passages belonging to the same question set into separate <stimulus> blocks! Once the shared stimulus ends, all questions, labels, stems, choices, and options that follow MUST be fully annotated with their respective tags (<question_label>, <stem>, <option_label>, <option_text>). Do NOT skip annotating question components after or around a stimulus!
3. <question_label>...</question_label>: Wrap question prefix indicators (e.g. "**101.**", "**131.**", "101.", "Câu 1:").
4. <stem>...</stem>: Wrap the main text body of a question following the question label.
5. <option_label>...</option_label>: Wrap choice letters/prefixes and sub-item/sub-question indicators (e.g. "(A)", "(B)", "(C)", "(D)", "A.", "B.", "a)", "b)", "c)", "d)", "a.", "b."). ESSAY & SUB-QUESTION RULE: In essay, long-answer, constructed-response, or multi-part questions where sub-items like "a)", "b)", "c)", "d)" appear without multiple-choice options to select, wrap the sub-item labels "a)", "b)" in <option_label>...</option_label> and their corresponding body text in <option_text>...</option_text>. Never absorb sub-item labels "a)", "b)" into <stem>!
6. <option_text>...</option_text>: Wrap the textual content of choices or sub-question items following an <option_label>.
7. <explanation>...</explanation>: Wrap reference explanations, answers explanation texts, and solutions for questions.

---

## ⛔ Strict Rules:

1. **NO TEXT MODIFICATION:** Do NOT alter, correct, spell-check, or omit any character, typo, LaTeX expression ($...$ or $$...$$), or page marker (`<|page|>Page X`). Preserve 100% of input text layout.
2. **NO ATTRIBUTE TAGS:** Do NOT output attribute parameters like `stimulus_id="..."` or `id="..."`. Use clean XML tags (`<stimulus>`, `<section>`, `<question_label>`, `<stem>`, `<option_label>`, `<option_text>`).
3. **FULL ANNOTATION COVERAGE:** Output the ENTIRE input text from start to end. ALL components in the input text MUST be annotated using their appropriate XML tags from the Tag Dictionary (<section>, <stimulus>, <question_label>, <stem>, <option_label>, <option_text>, <explanation>). You MUST annotate every question, stem, option label, and option text without exception—do NOT skip annotating questions or options when a stimulus is present, and do NOT leave text untagged!
4. **NO MARKDOWN CODEBLOCKS:** Output ONLY the annotated text directly. Do not wrap the output in ```xml codeblocks.
5. **CONCISE THINKING TRACE:** Use `<think>` block for concise reasoning (< 300 words) highlighting layout, edge cases, and verification.
6. **END DELIMITER:** Append `<|END|>` at the very end of your output to indicate the annotation is complete.
7. **STRICT STOP RULE:** Annotate ONLY the text provided in the user input prompt. DO NOT generate, invent, or hallucinate questions or reading passages beyond the provided input text. Stop immediately and append `<|END|>` as soon as you reach the last character of the input text.
8. **SUB-QUESTION & CHOICE LABELS:** Sub-item markers (e.g. "a)", "b)", "c)", "d)") in essay, long-answer, true/false, or structured questions must ALWAYS be tagged as <option_label> (and their body text as <option_text>). Never absorb "a)", "b)" sub-item indicators into <stem>!
"""



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
    model_name: Optional[str] = None,
    deepseek_key: Optional[str] = None,
    llm_key: Optional[str] = None,
    xah_key: Optional[str] = None,
    provider: Optional[str] = None,
) -> Tuple[OpenAI, str]:
    """
    Initializes OpenAI client routed to the appropriate provider (Xah, NVIDIA, Vilao, DeepSeek) based on config.
    """
    target_model = model_name or PARSER_MODEL
    target_provider = (provider or PARSER_PROVIDER or "xah").lower()

    deepseek_key = deepseek_key or os.environ.get("DEEPSEEK_API_KEY")
    nvidia_key = os.environ.get("NVIDIA_API_KEY") or deepseek_key
    llm_key = llm_key or os.environ.get("LLM_API_KEY")
    xah_key = xah_key or os.environ.get("XAH_API_KEY") or os.environ.get("LLM_API_KEY")
    cmd_key = os.environ.get("CMD_API_KEY") or os.environ.get("COMMANDCODE_API_KEY") or deepseek_key

    if target_provider == "nvidia":
        print(f"Routing to NVIDIA NIM with model: {target_model}")
        return OpenAI(
            api_key=nvidia_key, base_url="https://integrate.api.nvidia.com/v1"
        ), target_model
    elif target_provider == "xah":
        print(f"Routing to Xah.io API with model: {target_model}")
        return OpenAI(api_key=xah_key, base_url="https://api.xah.io/v1"), target_model
    elif target_provider == "vilao":
        print(f"Routing to Vilao.ai API with model: {target_model}")
        return OpenAI(api_key=llm_key, base_url="https://api.vilao.ai/v1"), target_model
    elif target_provider == "commandcode":
        print(f"Routing to CommandCode API with model: {target_model}")
        return OpenAI(api_key=cmd_key, base_url="http://127.0.0.1:8787/v1"), target_model
    else:
        print(f"Routing to DeepSeek API with model: {target_model}")
        return OpenAI(
            api_key=deepseek_key, base_url="https://api.deepseek.com"
        ), target_model


def load_few_shot_messages(example_dir: Path, max_pairs: int = 2) -> List[Dict[str, str]]:
    """Loads few-shot example pairs from in_X.md and out_X.md files."""
    messages = []
    i = 1
    loaded_count = 0
    # Prioritize in_7.md if it exists (TOEIC passage example)
    priority_in_7 = example_dir / "in_7.md"
    priority_out_7 = example_dir / "out_7.md"
    if priority_in_7.exists() and priority_out_7.exists():
        try:
            with open(priority_in_7, "r", encoding="utf-8") as f_in, open(priority_out_7, "r", encoding="utf-8") as f_out:
                messages.append({"role": "user", "content": f_in.read()})
                messages.append({"role": "assistant", "content": f_out.read()})
                loaded_count += 1
        except Exception:
            pass

    while loaded_count < max_pairs:
        if i == 7:
            i += 1
            continue
        in_file = example_dir / f"in_{i}.md"
        out_file = example_dir / f"out_{i}.md"
        if not (in_file.exists() and out_file.exists()):
            break
        try:
            with open(in_file, "r", encoding="utf-8") as f_in, open(out_file, "r", encoding="utf-8") as f_out:
                messages.append({"role": "user", "content": f_in.read()})
                messages.append({"role": "assistant", "content": f_out.read()})
                loaded_count += 1
        except Exception:
            pass
        i += 1

    if messages:
        print(f"  Loaded {len(messages) // 2} few-shot example pair(s).")
    return messages


def prune_hallucinated_xml_tail(raw_xml: str, raw_ocr_text: str) -> str:
    """
    Prunes hallucinated questions/passages emitted by the LLM beyond the end of the input OCR text string.
    """
    lines = raw_xml.splitlines()
    pruned_lines = []

    for line in lines:
        line_s = line.strip()
        if not line_s or line_s.startswith("<!--"):
            pruned_lines.append(line)
            continue

        clean_text = re.sub(r"<[^>]+>", "", line_s).strip()
        q_match = re.search(r"\*\*?(\d{1,4})\.\*\*?", clean_text)
        if q_match:
            q_num = q_match.group(1)
            if f"**{q_num}.**" not in raw_ocr_text and f"{q_num}." not in raw_ocr_text:
                break

        pruned_lines.append(line)

    return "\n".join(pruned_lines)


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
        self.few_shot_messages = load_few_shot_messages(script_dir / "examples" / "annotator")
        self.thinking_disabled = PARSER_THINKING == "disabled"

    def _make_extra_body(self) -> Optional[Dict[str, Any]]:
        if self.thinking_disabled:
            return {"thinking": {"type": "disabled"}}
        return None

    def _find_continuation_offset(
        self, prev_raw_text: str, cont_raw_text: str, full_text: str
    ) -> int:
        """Find where cont_raw_text starts in full_text, after prev_raw_text."""
        prev_len = len(prev_raw_text)
        search_start = max(0, prev_len - 80)
        search_end = min(len(full_text), prev_len + 80)

        anchor = cont_raw_text[:min(100, len(cont_raw_text))]
        if not anchor:
            return prev_len

        idx = full_text.find(anchor, search_start, search_end)
        if idx != -1:
            return idx

        anchor_stripped = anchor.strip()
        if anchor_stripped and anchor_stripped != anchor:
            idx = full_text.find(anchor_stripped, search_start, search_end)
            if idx != -1:
                return idx

        return prev_len

    def _llm_annotate_chunk(
        self, text_chunk: str, previous_tagged: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sends text to the LLM for annotation.
        On continuation rounds, sends the full original text together with the
        previous assistant output as conversation context so the LLM knows
        exactly where to continue from.
        """
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ] + self.few_shot_messages

        if previous_tagged:
            messages.append({"role": "user", "content": text_chunk})
            messages.append({"role": "assistant", "content": previous_tagged})
            messages.append({
                "role": "user",
                "content": (
                    "Continue annotating from the exact point where your previous "
                    "output ended. Append <|END|> when the annotation is complete."
                ),
            })
        else:
            messages.append({"role": "user", "content": text_chunk})

        kwargs = dict(model=self.model_name, messages=messages, temperature=0.0)
        extra_body = self._make_extra_body()
        if extra_body:
            kwargs["extra_body"] = extra_body

        import time
        start_time = time.time()
        response = self.client.chat.completions.create(**kwargs)
        duration_sec = time.time() - start_time

        try:
            from backend.app.services.llm_logger import log_llm_call
            log_llm_call(
                messages=messages,
                response=response,
                model=self.model_name,
                provider=getattr(self, "provider", ""),
                duration_sec=duration_sec
            )
        except Exception as e:
            print(f"[LLM Logger Warning] Failed to log LLM request: {e}")

        raw_result = response.choices[0].message.content
        tagged_text = clean_llm_response(raw_result)

        is_complete = "<|END|>" in tagged_text
        tagged_text_clean = tagged_text.replace("<|END|>", "")

        raw_text, spans = parse_xml_annotations(tagged_text_clean)

        return {
            "raw_text": raw_text,
            "spans": spans,
            "tagged_text": tagged_text,
            "is_complete": is_complete,
        }

    def annotate_text(self, raw_ocr_text: str) -> Dict[str, Any]:
        """
        Annotates raw OCR text with LLM and aligns character spans to BIO sequence labels.
        Automatically handles output truncation by continuing annotation in multiple rounds
        until the <|END|> delimiter is found.
        Each continuation round sends the full original text together with the previous
        assistant output so the LLM continues from the exact next token.
        """
        if not raw_ocr_text.strip():
            raise ValueError("Input OCR text is empty.")

        all_tagged_texts = []
        all_spans = []
        previous_tagged = None
        accumulated_raw = ""
        max_iterations = 5

        for iteration in range(max_iterations):
            chunk_result = self._llm_annotate_chunk(raw_ocr_text, previous_tagged)

            if iteration == 0:
                accumulated_raw = chunk_result["raw_text"]
            else:
                actual_offset = self._find_continuation_offset(
                    accumulated_raw, chunk_result["raw_text"], raw_ocr_text,
                )
                for span in chunk_result["spans"]:
                    span["start"] += actual_offset
                    span["end"] += actual_offset
                accumulated_raw = raw_ocr_text[
                    :actual_offset + len(chunk_result["raw_text"])
                ]

            all_tagged_texts.append(chunk_result["tagged_text"])
            all_spans.extend(chunk_result["spans"])

            if chunk_result["is_complete"]:
                break

            previous_tagged = chunk_result["tagged_text"]

        raw_xml = "\n".join(all_tagged_texts)

        tokens, offsets = tokenize_raw_text(raw_ocr_text)
        bio_tags, label_ids = align_spans_to_bio_tags(
            raw_ocr_text, tokens, offsets, all_spans, TAG_TO_ID
        )

        validate_bio_sequence(bio_tags)

        return {
            "raw_text": raw_ocr_text,
            "raw_xml": raw_xml,
            "spans": all_spans,
            "tokens": tokens,
            "offsets": offsets,
            "tags": bio_tags,
            "labels": label_ids,
            "label_mapping": TAG_TO_ID,
            "annotated": True,
        }

    def _llm_annotate_chunk_stream(
        self, text_chunk: str, callback=None,
        streamed_base: int = 0, estimated_total: int = 0,
        previous_tagged: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Streams text to the LLM for annotation, invoking callback.
        On continuation rounds, sends the full original text together with the
        previous assistant output as conversation context.
        """
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ] + self.few_shot_messages

        if previous_tagged:
            messages.append({"role": "user", "content": text_chunk})
            messages.append({"role": "assistant", "content": previous_tagged})
            messages.append({
                "role": "user",
                "content": (
                    "Continue annotating from the exact point where your previous "
                    "output ended. Append <|END|> when the annotation is complete."
                ),
            })
        else:
            messages.append({"role": "user", "content": text_chunk})

        kwargs = dict(
            model=self.model_name,
            messages=messages,
            temperature=0.0,
            stream=True,
        )
        extra_body = self._make_extra_body()
        if extra_body:
            kwargs["extra_body"] = extra_body

        import time
        max_retries = 3
        retry_delay = 2.0
        full_chunks = []
        streamed_token_count = streamed_base

        from backend.app.services.llm_logger import StreamingLLMLogger
        stream_logger = StreamingLLMLogger(
            messages=messages,
            model=self.model_name,
            provider=getattr(self, "provider", ""),
            flush_interval_sec=5.0
        )

        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(**kwargs)
                full_chunks = []
                streamed_token_count = streamed_base
                for chunk in response:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta
                        content = getattr(delta, "content", None) or ""
                        reasoning = getattr(delta, "reasoning_content", None) or ""
                        usage = getattr(chunk, "usage", None)

                        if content or reasoning or usage:
                            stream_logger.append_chunk(content=content, reasoning=reasoning, usage=usage)

                        if content:
                            full_chunks.append(content)
                            chunk_tokens = max(1, len(content.split()))
                            streamed_token_count += chunk_tokens
                            if callback:
                                callback(streamed_token_count, estimated_total, content)
                stream_logger.finalize()
                break
            except Exception as e:
                print(f"  [Warning] OCR annotation stream error on attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    raise e
                time.sleep(retry_delay)

        raw_result = "".join(full_chunks)
        tagged_text = clean_llm_response(raw_result)

        is_complete = "<|END|>" in tagged_text
        tagged_text_clean = tagged_text.replace("<|END|>", "")

        raw_text, spans = parse_xml_annotations(tagged_text_clean)

        return {
            "raw_text": raw_text,
            "spans": spans,
            "tagged_text": tagged_text,
            "is_complete": is_complete,
            "streamed_token_count": streamed_token_count,
        }

    def annotate_text_stream(self, raw_ocr_text: str, callback=None) -> Dict[str, Any]:
        """
        Annotates raw OCR text with LLM using token streaming,
        invoking callback(streamed_tokens, estimated_total_tokens, content_chunk)
        on each stream chunk.
        Automatically handles output truncation by continuing annotation in
        multiple rounds until the <|END|> delimiter is found.
        """
        if not raw_ocr_text.strip():
            raise ValueError("Input OCR text is empty.")

        words = raw_ocr_text.split()
        original_input_tokens = max(30, int(len(words) * 1.3))
        estimated_total_tokens = int(original_input_tokens * 1.8)

        all_tagged_texts = []
        all_spans = []
        streamed_total = 0
        previous_tagged = None
        accumulated_raw = ""
        max_iterations = 5

        for iteration in range(max_iterations):
            chunk_result = self._llm_annotate_chunk_stream(
                raw_ocr_text,
                callback=callback, streamed_base=streamed_total,
                estimated_total=estimated_total_tokens,
                previous_tagged=previous_tagged,
            )

            if iteration == 0:
                accumulated_raw = chunk_result["raw_text"]
            else:
                actual_offset = self._find_continuation_offset(
                    accumulated_raw, chunk_result["raw_text"], raw_ocr_text,
                )
                for span in chunk_result["spans"]:
                    span["start"] += actual_offset
                    span["end"] += actual_offset
                accumulated_raw = raw_ocr_text[
                    :actual_offset + len(chunk_result["raw_text"])
                ]

            all_tagged_texts.append(chunk_result["tagged_text"])
            all_spans.extend(chunk_result["spans"])
            streamed_total = chunk_result["streamed_token_count"]

            if chunk_result["is_complete"]:
                break

            previous_tagged = chunk_result["tagged_text"]

        raw_xml = prune_hallucinated_xml_tail("\n".join(all_tagged_texts), raw_ocr_text)

        tokens, offsets = tokenize_raw_text(raw_ocr_text)
        bio_tags, label_ids = align_spans_to_bio_tags(
            raw_ocr_text, tokens, offsets, all_spans, TAG_TO_ID
        )

        validate_bio_sequence(bio_tags)

        return {
            "raw_text": raw_ocr_text,
            "raw_xml": raw_xml,
            "spans": all_spans,
            "tokens": tokens,
            "offsets": offsets,
            "tags": bio_tags,
            "labels": label_ids,
            "label_mapping": TAG_TO_ID,
            "annotated": True,
        }


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
        "--provider", choices=["deepseek", "nvidia", "vilao", "xah", "commandcode"], default=None
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
