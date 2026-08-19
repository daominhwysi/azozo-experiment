import os
import re
import json
import shutil
import time
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union, Set
from pydantic import BaseModel, Field
from difflib import SequenceMatcher

from backend.app.core.config import (
    REVIEWER_MODEL,
    REVIEWER_PROVIDER,
    REVIEWER_THINKING,
    REVIEWER_MIN_SCORE,
    PARSER_MODEL,
    PARSER_PROVIDER,
    get_provider_api_key,
)
from backend.app.domains.llm.deepseek_client import chat

# Allowed tag schema for sequence labelling & embedded markdown/HTML structure
HTML_VOID_TAGS = {"br", "hr", "img", "col", "wbr", "input"}
ALLOWED_FORMATTING_TAGS = {
    "table",
    "tr",
    "td",
    "th",
    "tbody",
    "thead",
    "tfoot",
    "b",
    "i",
    "u",
    "strong",
    "em",
    "sub",
    "sup",
    "span",
    "div",
    "p",
    "ol",
    "ul",
    "li",
    "code",
    "pre",
}

ALLOWED_PAIRED_TAGS = {
    "section",
    "stimulus",
    "question_label",
    "stem",
    "option_label",
    "option_text",
    "explanation",
} | ALLOWED_FORMATTING_TAGS

ALLOWED_SELF_CLOSING_TAGS = {"stimulus", "figure"} | HTML_VOID_TAGS
PROHIBITED_TAGS = {"pages", "page", "page_metadata", "think"}


class ReviewDecision(str, Enum):
    PASS = "PASS"
    NEEDS_REVISION = "NEEDS_REVISION"
    DISCARD = "DISCARD"


class IssueSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    MAJOR = "MAJOR"
    MINOR = "MINOR"
    INFO = "INFO"


class AuditIssue(BaseModel):
    category: str
    severity: IssueSeverity
    message: str
    line_number: Optional[int] = None
    context_snippet: Optional[str] = None


class RubricScores(BaseModel):
    xml_well_formedness: float = Field(default=100.0, ge=0.0, le=100.0)
    schema_conformance: float = Field(default=100.0, ge=0.0, le=100.0)
    verbatim_fidelity: float = Field(default=100.0, ge=0.0, le=100.0)
    sequence_continuity: float = Field(default=100.0, ge=0.0, le=100.0)
    question_option_completeness: float = Field(default=100.0, ge=0.0, le=100.0)
    stimulus_accuracy: float = Field(default=100.0, ge=0.0, le=100.0)


class ReviewReport(BaseModel):
    doc_id: str
    file_path: Optional[str] = None
    raw_file_path: Optional[str] = None
    overall_score: float = Field(default=0.0, ge=0.0, le=100.0)
    deterministic_score: float = Field(default=0.0, ge=0.0, le=100.0)
    llm_score: Optional[float] = None
    grade: str = "F"  # A, B, C, D, F
    decision: ReviewDecision = ReviewDecision.DISCARD
    is_malfunctioned: bool = False
    discard_reasons: List[str] = Field(default_factory=list)
    rubric_scores: RubricScores = Field(default_factory=RubricScores)
    issues: List[AuditIssue] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    parser_info: Optional[Dict[str, Any]] = None
    summary: str = ""
    reviewed_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    reviewer_model: Optional[str] = None
    reviewer_provider: Optional[str] = None


class BatchReviewSummary(BaseModel):
    total_documents: int = 0
    passed_count: int = 0
    needs_revision_count: int = 0
    discarded_count: int = 0
    discarded_paths: List[str] = Field(default_factory=list)
    average_score: float = 0.0
    duration_sec: float = 0.0
    reports: List[ReviewReport] = Field(default_factory=list)
    failure_reasons_distribution: Dict[str, int] = Field(default_factory=dict)


def compute_grade(score: float) -> str:
    if score >= 90.0:
        return "A"
    elif score >= 80.0:
        return "B"
    elif score >= 70.0:
        return "C"
    elif score >= 60.0:
        return "D"
    return "F"


class DeterministicAuditor:
    """
    High-speed deterministic static analyzer and integrity auditor for sequence-labelled XML.
    """

    @staticmethod
    def strip_xml_tags(xml_text: str) -> str:
        """Strips all XML tags to reconstruct pure text content."""
        clean = re.sub(r"<[^>]+>", "", xml_text)
        return clean

    @staticmethod
    def check_xml_syntax(xml_content: str) -> Tuple[List[AuditIssue], float]:
        """
        Validates tag pairing, closure, unclosed opening brackets, and structural XML syntax.
        """
        issues: List[AuditIssue] = []
        deductions = 0.0

        if not xml_content or not xml_content.strip():
            issues.append(
                AuditIssue(
                    category="xml_syntax",
                    severity=IssueSeverity.CRITICAL,
                    message="Document content is completely empty.",
                )
            )
            return issues, 0.0

        # Check for unclosed tag at the very end of generation
        trailing_match = re.search(r"</?([a-zA-Z_0-9\-]*)$", xml_content.strip())
        if trailing_match and trailing_match.group(1):
            tag_fragment = trailing_match.group(0)
            if tag_fragment.startswith("<"):
                issues.append(
                    AuditIssue(
                        category="xml_syntax",
                        severity=IssueSeverity.CRITICAL,
                        message=f"Output truncated mid-tag at file termination: '{tag_fragment}'",
                        context_snippet=xml_content[-80:],
                    )
                )
                deductions += 40.0

        # Lex tags with line numbers
        tag_pattern = re.compile(r"<(/)?([a-zA-Z_0-9\-]+)(?:\s+([^>]*))?(/)?>")
        lines = xml_content.splitlines()

        tag_stack: List[Tuple[str, int, str]] = []  # (tag_name, line_num, full_tag)
        all_tags_found = 0

        current_line_num = 1
        pos = 0

        for match in tag_pattern.finditer(xml_content):
            all_tags_found += 1
            start_pos = match.start()
            # Calculate line number
            current_line_num = xml_content.count("\n", 0, start_pos) + 1

            is_closing = bool(match.group(1))
            tag_name = match.group(2).lower()
            is_self_closing = bool(match.group(4)) or tag_name in ALLOWED_SELF_CLOSING_TAGS

            full_match = match.group(0)

            # Check self closing
            if is_self_closing or full_match.endswith("/>"):
                continue

            if not is_closing:
                # Opening tag
                if tag_name not in ALLOWED_PAIRED_TAGS and tag_name not in PROHIBITED_TAGS:
                    issues.append(
                        AuditIssue(
                            category="schema_conformance",
                            severity=IssueSeverity.MAJOR,
                            message=f"Unknown/unsupported XML tag '<{tag_name}>'",
                            line_number=current_line_num,
                            context_snippet=full_match,
                        )
                    )
                    deductions += 10.0
                tag_stack.append((tag_name, current_line_num, full_match))
            else:
                # Closing tag
                if not tag_stack:
                    issues.append(
                        AuditIssue(
                            category="xml_syntax",
                            severity=IssueSeverity.CRITICAL,
                            message=f"Unexpected closing tag '</{tag_name}>' with no matching open tag.",
                            line_number=current_line_num,
                            context_snippet=full_match,
                        )
                    )
                    deductions += 25.0
                else:
                    last_open, last_line, last_tag = tag_stack.pop()
                    if last_open != tag_name:
                        issues.append(
                            AuditIssue(
                                category="xml_syntax",
                                severity=IssueSeverity.CRITICAL,
                                message=f"Mismatched closing tag '</{tag_name}>' at line {current_line_num}, expected '</{last_open}>' (opened at line {last_line}).",
                                line_number=current_line_num,
                                context_snippet=f"{last_tag} ... {full_match}",
                            )
                        )
                        deductions += 30.0

        # Any unclosed tags remaining in stack?
        for unclosed_name, unclosed_line, unclosed_tag in tag_stack:
            issues.append(
                AuditIssue(
                    category="xml_syntax",
                    severity=IssueSeverity.CRITICAL,
                    message=f"Unclosed tag '<{unclosed_name}>' opened at line {unclosed_line} was never closed.",
                    line_number=unclosed_line,
                    context_snippet=unclosed_tag,
                )
            )
            deductions += 25.0

        if all_tags_found == 0:
            issues.append(
                AuditIssue(
                    category="xml_syntax",
                    severity=IssueSeverity.CRITICAL,
                    message="No XML sequence tags found in the entire document.",
                )
            )
            deductions += 100.0

        score = max(0.0, 100.0 - deductions)
        return issues, score

    @staticmethod
    def check_prohibited_tags(xml_content: str) -> Tuple[List[AuditIssue], float]:
        """
        Audits presence of prohibited tags like <pages>, <page>, <page_metadata>, <think>.
        """
        issues: List[AuditIssue] = []
        deductions = 0.0

        for prohibited in PROHIBITED_TAGS:
            pattern = re.compile(rf"</?{prohibited}(?:\s+[^>]*)?>", re.IGNORECASE)
            matches = list(pattern.finditer(xml_content))
            if matches:
                count = len(matches)
                first_match = matches[0]
                line_num = xml_content.count("\n", 0, first_match.start()) + 1
                issues.append(
                    AuditIssue(
                        category="prohibited_tags",
                        severity=IssueSeverity.CRITICAL if prohibited in ["pages", "page"] else IssueSeverity.MAJOR,
                        message=f"Found {count} instance(s) of prohibited tag '<{prohibited}>'. Page boundaries and metadata must be pruned.",
                        line_number=line_num,
                        context_snippet=first_match.group(0),
                    )
                )
                deductions += 20.0 * min(count, 3)

        score = max(0.0, 100.0 - deductions)
        return issues, score

    @staticmethod
    def check_question_and_option_structure(
        xml_content: str,
    ) -> Tuple[List[AuditIssue], float, Dict[str, Any]]:
        """
        Audits questions, stems, choices, and sub-questions completeness and integrity.
        """
        issues: List[AuditIssue] = []
        deductions = 0.0

        # Extract elements
        q_labels = re.findall(r"<question_label>(.*?)</question_label>", xml_content, re.DOTALL)
        stems = re.findall(r"<stem>(.*?)</stem>", xml_content, re.DOTALL)
        opt_labels = re.findall(r"<option_label>(.*?)</option_label>", xml_content, re.DOTALL)
        opt_texts = re.findall(r"<option_text>(.*?)</option_text>", xml_content, re.DOTALL)
        stimuli = re.findall(r"<stimulus\b([^>]*)/?>", xml_content, re.DOTALL)
        sections = re.findall(r"<section>(.*?)</section>", xml_content, re.DOTALL)
        figures = re.findall(r"<figure\b([^>]*)/?>", xml_content, re.DOTALL)

        metrics = {
            "questions_count": len(q_labels),
            "stems_count": len(stems),
            "option_labels_count": len(opt_labels),
            "option_texts_count": len(opt_texts),
            "stimuli_count": len(stimuli),
            "sections_count": len(sections),
            "figures_count": len(figures),
        }

        if len(q_labels) == 0:
            issues.append(
                AuditIssue(
                    category="question_structure",
                    severity=IssueSeverity.CRITICAL,
                    message="Zero questions (<question_label>) detected in document.",
                )
            )
            return issues, 0.0, metrics

        # Empty stems check
        empty_stems = [s for s in stems if not s.strip()]
        if empty_stems:
            issues.append(
                AuditIssue(
                    category="question_structure",
                    severity=IssueSeverity.MAJOR,
                    message=f"Detected {len(empty_stems)} empty <stem> tags.",
                )
            )
            deductions += 15.0 * len(empty_stems)

        # Empty option text check
        empty_opts = [o for o in opt_texts if not o.strip()]
        if empty_opts:
            issues.append(
                AuditIssue(
                    category="option_structure",
                    severity=IssueSeverity.MAJOR,
                    message=f"Detected {len(empty_opts)} empty <option_text> tags.",
                )
            )
            deductions += 10.0 * len(empty_opts)

        # Ratio of option_labels to option_texts
        # Normally option_labels and option_texts should be close, unless tabular true/false is present
        if len(opt_labels) > 0 and len(opt_texts) == 0:
            issues.append(
                AuditIssue(
                    category="option_structure",
                    severity=IssueSeverity.CRITICAL,
                    message=f"Found {len(opt_labels)} <option_label> tags but ZERO <option_text> tags (orphaned choice labels).",
                )
            )
            deductions += 40.0
        elif abs(len(opt_labels) - len(opt_texts)) > max(5, int(len(opt_labels) * 0.4)):
            # Warning about potential mismatch
            issues.append(
                AuditIssue(
                    category="option_structure",
                    severity=IssueSeverity.MINOR,
                    message=f"Imbalance between option labels ({len(opt_labels)}) and option texts ({len(opt_texts)}).",
                )
            )
            deductions += 10.0

        # Sub-question check: check if stems contain un-tagged sub-item patterns (e.g. "\n- a)" or "\n- b)")
        subitem_in_stem_count = 0
        for s in stems:
            if re.search(r"(?:^|\n)\s*[-*•]?\s*[a-d]\)\s+[A-ZÀ-Ỹ0-9]", s):
                subitem_in_stem_count += 1

        if subitem_in_stem_count > 0:
            issues.append(
                AuditIssue(
                    category="question_structure",
                    severity=IssueSeverity.MAJOR,
                    message=f"Found {subitem_in_stem_count} question stems containing un-tagged sub-questions ('a)', 'b)'). These must be tagged in <option_label> + <option_text>.",
                )
            )
            deductions += 15.0 * min(subitem_in_stem_count, 3)

        score = max(0.0, 100.0 - deductions)
        return issues, score, metrics

    @staticmethod
    def check_sequence_continuity(xml_content: str) -> Tuple[List[AuditIssue], float]:
        """
        Audits question numbering sequence, detecting gaps, duplicates, and infinite loops.
        """
        issues: List[AuditIssue] = []
        deductions = 0.0

        q_labels = re.findall(r"<question_label>(.*?)</question_label>", xml_content, re.DOTALL)
        if not q_labels:
            return issues, 0.0

        question_numbers: List[int] = []
        for ql in q_labels:
            digits = re.findall(r"\d+", ql)
            if digits:
                question_numbers.append(int(digits[0]))

        if not question_numbers:
            return issues, 100.0

        # Check for repetition loops (e.g. [1, 1, 1, 1, 1] or [101, 101, 101])
        consecutive_dups = 0
        for i in range(1, len(question_numbers)):
            if question_numbers[i] == question_numbers[i - 1]:
                consecutive_dups += 1

        if consecutive_dups >= 4:
            issues.append(
                AuditIssue(
                    category="continuity",
                    severity=IssueSeverity.CRITICAL,
                    message=f"Detected infinite repetition loop: {consecutive_dups} consecutive duplicate question numbers ({question_numbers[:6]}...).",
                )
            )
            deductions += 60.0
        elif consecutive_dups > 0:
            issues.append(
                AuditIssue(
                    category="continuity",
                    severity=IssueSeverity.MINOR,
                    message=f"Found {consecutive_dups} duplicate question numbers in sequence.",
                )
            )
            deductions += 5.0 * consecutive_dups

        # Check for large numbering gaps if monotonically increasing
        is_increasing = all(
            question_numbers[i] <= question_numbers[i + 1]
            for i in range(len(question_numbers) - 1)
        )
        if is_increasing and len(question_numbers) >= 5:
            full_set = set(range(question_numbers[0], question_numbers[-1] + 1))
            missing = sorted(list(full_set - set(question_numbers)))
            if len(missing) > max(3, int(len(question_numbers) * 0.3)):
                issues.append(
                    AuditIssue(
                        category="continuity",
                        severity=IssueSeverity.MAJOR,
                        message=f"Large numbering gap detected ({len(missing)} missing questions between {question_numbers[0]} and {question_numbers[-1]}): {missing[:8]}...",
                    )
                )
                deductions += 20.0

        score = max(0.0, 100.0 - deductions)
        return issues, score

    @staticmethod
    def check_stimulus_anchors(
        xml_content: str, pure_text: str, raw_ocr_text: Optional[str] = None
    ) -> Tuple[List[AuditIssue], float]:
        """
        Audits stimulus anchor tags (start_anchor, end_anchor) and multi-question rule.
        """
        issues: List[AuditIssue] = []
        deductions = 0.0

        stimulus_tags = re.findall(r"<stimulus\b([^>]*)/?>", xml_content)
        if not stimulus_tags:
            return issues, 100.0

        for stim_idx, stim_attr in enumerate(stimulus_tags):
            start_m = re.search(r'start_anchor="([^"]*)"', stim_attr)
            end_m = re.search(r'end_anchor="([^"]*)"', stim_attr)

            if not start_m or not end_m:
                issues.append(
                    AuditIssue(
                        category="stimulus",
                        severity=IssueSeverity.MAJOR,
                        message=f"Stimulus #{stim_idx+1} missing required 'start_anchor' or 'end_anchor' attribute.",
                        context_snippet=f"<stimulus {stim_attr} />",
                    )
                )
                deductions += 15.0
                continue

            start_anchor = start_m.group(1).strip()
            end_anchor = end_m.group(1).strip()

            if len(start_anchor) < 3 or len(end_anchor) < 3:
                issues.append(
                    AuditIssue(
                        category="stimulus",
                        severity=IssueSeverity.MINOR,
                        message=f"Stimulus #{stim_idx+1} has very short anchors ('{start_anchor}', '{end_anchor}'). Recommended 3-10 words.",
                    )
                )
                deductions += 5.0

            # If raw OCR text is provided, verify anchors exist in source document
            if raw_ocr_text:
                norm_raw = " ".join(raw_ocr_text.split())
                norm_start = " ".join(start_anchor.split())
                norm_end = " ".join(end_anchor.split())

                if norm_start and norm_start not in norm_raw:
                    issues.append(
                        AuditIssue(
                            category="stimulus",
                            severity=IssueSeverity.MAJOR,
                            message=f"Stimulus #{stim_idx+1} start_anchor '{start_anchor}' not found in raw source document text.",
                        )
                    )
                    deductions += 15.0

                if norm_end and norm_end not in norm_raw:
                    issues.append(
                        AuditIssue(
                            category="stimulus",
                            severity=IssueSeverity.MAJOR,
                            message=f"Stimulus #{stim_idx+1} end_anchor '{end_anchor}' not found in raw source document text.",
                        )
                    )
                    deductions += 15.0

        score = max(0.0, 100.0 - deductions)
        return issues, score

    @staticmethod
    def check_verbatim_alignment(
        xml_content: str, raw_ocr_text: Optional[str]
    ) -> Tuple[List[AuditIssue], float, Dict[str, Any]]:
        """
        Audits verbatim fidelity against raw OCR text if provided.
        """
        issues: List[AuditIssue] = []
        deductions = 0.0

        pure_text = DeterministicAuditor.strip_xml_tags(xml_content)
        annotated_chars = len(pure_text)
        annotated_words = len(pure_text.split())

        metrics: Dict[str, Any] = {
            "annotated_char_count": annotated_chars,
            "annotated_word_count": annotated_words,
            "raw_char_count": len(raw_ocr_text) if raw_ocr_text else None,
            "retention_ratio": None,
            "similarity_ratio": None,
        }

        if not raw_ocr_text:
            return issues, 100.0, metrics

        raw_chars = len(raw_ocr_text)
        raw_words = len(raw_ocr_text.split())
        metrics["raw_char_count"] = raw_chars
        metrics["raw_word_count"] = raw_words

        if raw_chars == 0:
            return issues, 100.0, metrics

        retention_ratio = annotated_chars / raw_chars
        metrics["retention_ratio"] = round(retention_ratio, 3)

        # If retention is very low (< 0.65) -> severe truncation / text dropped
        if retention_ratio < 0.65:
            issues.append(
                AuditIssue(
                    category="verbatim_fidelity",
                    severity=IssueSeverity.CRITICAL,
                    message=f"Severe text truncation: Annotated output contains only {retention_ratio*100:.1f}% of raw OCR text ({annotated_chars}/{raw_chars} chars).",
                )
            )
            deductions += 50.0
        elif retention_ratio < 0.85:
            issues.append(
                AuditIssue(
                    category="verbatim_fidelity",
                    severity=IssueSeverity.MAJOR,
                    message=f"Substantial text omission: Annotated output retained {retention_ratio*100:.1f}% of raw OCR text.",
                )
            )
            deductions += 20.0
        elif retention_ratio > 1.40:
            issues.append(
                AuditIssue(
                    category="verbatim_fidelity",
                    severity=IssueSeverity.CRITICAL,
                    message=f"Severe hallucination / repetition: Annotated output is {retention_ratio*100:.1f}% the size of raw OCR text ({annotated_chars}/{raw_chars} chars).",
                )
            )
            deductions += 50.0
        elif retention_ratio > 1.15:
            issues.append(
                AuditIssue(
                    category="verbatim_fidelity",
                    severity=IssueSeverity.MINOR,
                    message=f"Possible text repetition/hallucination: Output size is {retention_ratio*100:.1f}% of input.",
                )
            )
            deductions += 10.0

        # Sample similarity check using fast token overlap
        sample_raw = " ".join(raw_ocr_text.split()[:200])
        sample_annot = " ".join(pure_text.split()[:200])
        similarity = SequenceMatcher(None, sample_raw, sample_annot).ratio()
        metrics["similarity_ratio"] = round(similarity, 3)

        if similarity < 0.50:
            issues.append(
                AuditIssue(
                    category="verbatim_fidelity",
                    severity=IssueSeverity.MAJOR,
                    message=f"Low initial verbatim alignment similarity ({similarity*100:.1f}%). First tokens may have been altered or skipped.",
                )
            )
            deductions += 25.0

        score = max(0.0, 100.0 - deductions)
        return issues, score, metrics


class DeepSeekReviewer:
    """
    LLM-powered Semantic Reviewer using DeepSeek Client for in-depth quality analysis.
    """

    SYSTEM_PROMPT = """# [System Config]
Role: You are an expert AI Quality Assurance & Sequence Labelling Auditor for Exam Documents.
Your task is to critically inspect an annotated XML exam document against strict sequence labelling guidelines.

## Schema & Tag Dictionary:
1. <section>...</section>: Section headers, part titles, exam directions.
2. <stimulus id="..." start_anchor="..." end_anchor="..." />: Shared reading passages, tables, context prompts serving 2 OR MORE QUESTIONS.
3. <question_label>...</question_label>: Question prefixes (e.g. "**101.**", "Câu 1:").
4. <stem>...</stem>: Question body text.
5. <option_label>...</option_label>: Choice labels (A., B., (A)) AND sub-question labels (a), b), c)) in essay/true-false.
6. <option_text>...</option_text>: Choice or sub-question body text.
7. <explanation>...</explanation>: Solutions / answer keys.
8. <figure id="..." description="..." bbox="..." />: Vision OCR figure placeholder.

## Strict Rules:
- Rule 1: 100% Verbatim preservation. No text modification, no translation, LaTeX formulas intact.
- Rule 2: Multi-Question Stimulus Rule. <stimulus> ONLY for shared context with 2+ questions. 1-question context stays in <stem>.
- Rule 3: Sub-question labels (a), b)) must be wrapped in <option_label> + <option_text>, NEVER absorbed into <stem>.
- Rule 4: Prohibited tags (<pages>, <page>, <page_metadata>, <think>) must be pruned.
- Rule 5: Malfunctions include: truncated output, zero questions, hallucinated text, unclosed tags, corrupted math.

## Output Format:
Respond ONLY with a valid JSON object with NO markdown codeblocks or extra text:
{
  "score": <0-100 float>,
  "decision": "PASS" | "NEEDS_REVISION" | "DISCARD",
  "is_malfunctioned": <true/false boolean>,
  "discard_reasons": ["<reason1>", ...],
  "rubric_scores": {
    "xml_well_formedness": <0-100 float>,
    "schema_conformance": <0-100 float>,
    "verbatim_fidelity": <0-100 float>,
    "sequence_continuity": <0-100 float>,
    "question_option_completeness": <0-100 float>,
    "stimulus_accuracy": <0-100 float>
  },
  "issues": [
    {
      "category": "xml_syntax" | "prohibited_tags" | "question_structure" | "option_structure" | "stimulus" | "verbatim_fidelity" | "continuity" | "llm_semantic",
      "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO",
      "message": "<description of issue>",
      "context_snippet": "<snippet if applicable>"
    }
  ],
  "summary": "<concise review summary>"
}
"""

    def __init__(
        self,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        thinking: Optional[str] = None,
    ):
        self.model = model or REVIEWER_MODEL or PARSER_MODEL
        self.provider = provider or REVIEWER_PROVIDER or PARSER_PROVIDER
        self.thinking = thinking or REVIEWER_THINKING or "medium"

    def review_semantic(
        self,
        xml_content: str,
        deterministic_metrics: Dict[str, Any],
        raw_ocr_text: Optional[str] = None,
        max_xml_chars: int = 16000,
    ) -> Optional[Dict[str, Any]]:
        """
        Calls DeepSeek / LLM to semantically rate annotation quality and detect subtle malfunctions.
        """
        # Truncate sample if too large for prompt context
        xml_sample = xml_content
        if len(xml_content) > max_xml_chars:
            head = xml_content[: int(max_xml_chars * 0.7)]
            tail = xml_content[-int(max_xml_chars * 0.3) :]
            xml_sample = f"{head}\n\n<!-- ... [中間 content elided for token budget: {len(xml_content)} chars total] ... -->\n\n{tail}"

        user_prompt = (
            f"Review the following annotated XML exam document:\n\n"
            f"### Document Metrics from Deterministic Pre-check:\n"
            f"- Total Questions: {deterministic_metrics.get('questions_count', 'N/A')}\n"
            f"- Total Option Labels: {deterministic_metrics.get('option_labels_count', 'N/A')}\n"
            f"- Total Option Texts: {deterministic_metrics.get('option_texts_count', 'N/A')}\n"
            f"- Total Stimuli: {deterministic_metrics.get('stimuli_count', 'N/A')}\n"
            f"- Retention Ratio: {deterministic_metrics.get('retention_ratio', 'N/A')}\n\n"
            f"### Target Annotated XML:\n"
            f"```xml\n{xml_sample}\n```\n\n"
            f"Evaluate the quality, rate each rubric dimension, detect any hallucinations or malfunctions, and return your audit JSON."
        )

        try:
            raw_response = chat(
                prompt=user_prompt,
                system=self.SYSTEM_PROMPT,
                model=self.model,
                provider=self.provider,
                thinking=self.thinking,
            )

            cleaned = raw_response.strip()
            # Strip think tags
            cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.DOTALL).strip()
            # Strip code blocks
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if len(lines) >= 2:
                    if lines[-1].strip() == "```":
                        cleaned = "\n".join(lines[1:-1])
                    else:
                        cleaned = "\n".join(lines[1:])
            cleaned = cleaned.strip()

            # Find json block
            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(0))
            return json.loads(cleaned)
        except Exception as e:
            print(f"[Reviewer Warning] DeepSeek LLM evaluation call failed: {e}")
            return None


class AnnotationReviewerAgent:
    """
    Main Reviewer Agent for Azozo Sequence Labelling and Exam Document Pipeline.
    Combines deterministic static checks with DeepSeek semantic auditing to rate quality
    and automatically quarantine/discard malfunctioned documents.
    """

    def __init__(
        self,
        min_score: int = REVIEWER_MIN_SCORE,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        thinking: Optional[str] = None,
    ):
        self.min_score = min_score
        self.model = model or REVIEWER_MODEL
        self.provider = provider or REVIEWER_PROVIDER
        self.llm_reviewer = DeepSeekReviewer(
            model=self.model, provider=self.provider, thinking=thinking
        )

    def review_document(
        self,
        xml_content: str,
        raw_ocr_text: Optional[str] = None,
        doc_id: Optional[str] = None,
        file_path: Optional[str] = None,
        raw_file_path: Optional[str] = None,
        use_llm: bool = True,
    ) -> ReviewReport:
        """
        Executes a comprehensive review of an annotated XML document.
        """
        doc_id = doc_id or f"doc_{int(time.time()*1000)}"
        issues: List[AuditIssue] = []
        discard_reasons: List[str] = []

        pure_text = DeterministicAuditor.strip_xml_tags(xml_content)

        # 1. Deterministic XML syntax
        syntax_issues, syntax_score = DeterministicAuditor.check_xml_syntax(xml_content)
        issues.extend(syntax_issues)

        # 2. Prohibited tags
        prohibited_issues, prohibited_score = DeterministicAuditor.check_prohibited_tags(
            xml_content
        )
        issues.extend(prohibited_issues)

        # 3. Question & option structure
        q_issues, q_score, metrics = DeterministicAuditor.check_question_and_option_structure(
            xml_content
        )
        issues.extend(q_issues)

        # 4. Sequence continuity
        continuity_issues, continuity_score = DeterministicAuditor.check_sequence_continuity(
            xml_content
        )
        issues.extend(continuity_issues)

        # 5. Stimulus anchors
        stim_issues, stim_score = DeterministicAuditor.check_stimulus_anchors(
            xml_content, pure_text, raw_ocr_text
        )
        issues.extend(stim_issues)

        # 6. Verbatim alignment
        verbatim_issues, verbatim_score, verbatim_metrics = (
            DeterministicAuditor.check_verbatim_alignment(xml_content, raw_ocr_text)
        )
        issues.extend(verbatim_issues)
        metrics.update(verbatim_metrics)

        # Calculate deterministic composite score
        det_score = (
            syntax_score * 0.25
            + prohibited_score * 0.15
            + q_score * 0.25
            + verbatim_score * 0.15
            + continuity_score * 0.10
            + stim_score * 0.10
        )

        rubric = RubricScores(
            xml_well_formedness=round(syntax_score, 1),
            schema_conformance=round(prohibited_score, 1),
            verbatim_fidelity=round(verbatim_score, 1),
            sequence_continuity=round(continuity_score, 1),
            question_option_completeness=round(q_score, 1),
            stimulus_accuracy=round(stim_score, 1),
        )

        # Check for hard critical malfunctions that require immediate discard
        critical_issues = [iss for iss in issues if iss.severity == IssueSeverity.CRITICAL]
        if critical_issues:
            for c_iss in critical_issues:
                discard_reasons.append(f"[{c_iss.category.upper()}] {c_iss.message}")

        overall_score = det_score
        llm_score_val = None
        summary_text = f"Deterministic audit: {len(issues)} issue(s), {len(critical_issues)} critical."

        # 7. LLM Semantic Review (if enabled and no fatal syntax blocker)
        llm_result = None
        if use_llm and syntax_score > 20.0:
            llm_result = self.llm_reviewer.review_semantic(
                xml_content=xml_content,
                deterministic_metrics=metrics,
                raw_ocr_text=raw_ocr_text,
            )

            if llm_result:
                llm_score_val = float(llm_result.get("score", det_score))
                # Weighted score: 40% deterministic rule adherence, 60% LLM semantic judgment
                overall_score = round(det_score * 0.40 + llm_score_val * 0.60, 1)

                llm_rubric = llm_result.get("rubric_scores", {})
                if isinstance(llm_rubric, dict):
                    rubric.xml_well_formedness = round(
                        (rubric.xml_well_formedness + float(llm_rubric.get("xml_well_formedness", rubric.xml_well_formedness))) / 2, 1
                    )
                    rubric.schema_conformance = round(
                        (rubric.schema_conformance + float(llm_rubric.get("schema_conformance", rubric.schema_conformance))) / 2, 1
                    )
                    rubric.verbatim_fidelity = round(
                        (rubric.verbatim_fidelity + float(llm_rubric.get("verbatim_fidelity", rubric.verbatim_fidelity))) / 2, 1
                    )
                    rubric.sequence_continuity = round(
                        (rubric.sequence_continuity + float(llm_rubric.get("sequence_continuity", rubric.sequence_continuity))) / 2, 1
                    )
                    rubric.question_option_completeness = round(
                        (rubric.question_option_completeness + float(llm_rubric.get("question_option_completeness", rubric.question_option_completeness))) / 2, 1
                    )
                    rubric.stimulus_accuracy = round(
                        (rubric.stimulus_accuracy + float(llm_rubric.get("stimulus_accuracy", rubric.stimulus_accuracy))) / 2, 1
                    )

                for iss in llm_result.get("issues", []):
                    if isinstance(iss, dict):
                        issues.append(
                            AuditIssue(
                                category=iss.get("category", "llm_semantic"),
                                severity=IssueSeverity(iss.get("severity", "MINOR")),
                                message=iss.get("message", "Semantic issue detected by LLM"),
                                context_snippet=iss.get("context_snippet"),
                            )
                        )

                if llm_result.get("is_malfunctioned"):
                    for d_reason in llm_result.get("discard_reasons", []):
                        if d_reason not in discard_reasons:
                            discard_reasons.append(f"[LLM_AUDIT] {d_reason}")

                if llm_result.get("summary"):
                    summary_text = llm_result["summary"]

        overall_score = max(0.0, min(100.0, round(overall_score, 1)))
        grade = compute_grade(overall_score)

        # Decision logic
        is_malfunctioned = len(discard_reasons) > 0 or overall_score < self.min_score
        if is_malfunctioned:
            decision = ReviewDecision.DISCARD
            if not discard_reasons:
                discard_reasons.append(
                    f"Overall score {overall_score:.1f}/100 is below minimum threshold {self.min_score}."
                )
        elif overall_score >= 80.0 and not any(iss.severity in [IssueSeverity.CRITICAL, IssueSeverity.MAJOR] for iss in issues):
            decision = ReviewDecision.PASS
        elif overall_score >= 85.0:
            decision = ReviewDecision.PASS
        else:
            decision = ReviewDecision.NEEDS_REVISION

        return ReviewReport(
            doc_id=doc_id,
            file_path=str(file_path) if file_path else None,
            raw_file_path=str(raw_file_path) if raw_file_path else None,
            overall_score=overall_score,
            deterministic_score=round(det_score, 1),
            llm_score=round(llm_score_val, 1) if llm_score_val is not None else None,
            grade=grade,
            decision=decision,
            is_malfunctioned=is_malfunctioned,
            discard_reasons=discard_reasons,
            rubric_scores=rubric,
            issues=issues,
            metrics=metrics,
            summary=summary_text,
            reviewer_model=self.model,
            reviewer_provider=self.provider,
        )

    def review_file(
        self,
        xml_path: Union[str, Path],
        raw_path: Optional[Union[str, Path]] = None,
        use_llm: bool = True,
        save_audit_json: bool = False,
    ) -> ReviewReport:
        """
        Reviews a single XML file from disk against its raw markdown source if available.
        """
        xml_p = Path(xml_path)
        if not xml_p.exists():
            raise FileNotFoundError(f"Target XML file does not exist: {xml_path}")

        with open(xml_p, "r", encoding="utf-8", errors="replace") as f:
            xml_content = f.read()

        raw_content = None
        raw_p = Path(raw_path) if raw_path else None

        # Auto-discover matching raw .md file if not provided
        if not raw_p or not raw_p.exists():
            # Check parallel folder under sequence_labelling_input_data
            str_path = str(xml_p)
            if "sequence_labelling_annotated" in str_path:
                candidate_raw_str = str_path.replace(
                    "sequence_labelling_annotated", "sequence_labelling_input_data"
                )
                candidate_p = Path(candidate_raw_str)
                # If path was .../exam_123/merged.xml, candidate is .../exam_123.md
                if candidate_p.name in ["merged.xml", "merged.json"]:
                    candidate_md = candidate_p.parent.with_suffix(".md")
                    if candidate_md.exists():
                        raw_p = candidate_md

        if raw_p and raw_p.exists():
            with open(raw_p, "r", encoding="utf-8", errors="replace") as f:
                raw_content = f.read()

        # Extract parser metadata from merged.json if available
        parser_info = None
        if xml_p.parent.is_dir():
            merged_json = xml_p.parent / "merged.json"
            if merged_json.exists():
                try:
                    with open(merged_json, "r", encoding="utf-8", errors="replace") as f_json:
                        j_data = json.load(f_json)
                        parser_info = {
                            "merge_status": j_data.get("merge_status"),
                            "total_chunks": j_data.get("total_chunks"),
                            "duration_seconds": j_data.get("duration_seconds"),
                            "questions_count": j_data.get("questions_count"),
                            "linker_skipped": j_data.get("linker_skipped"),
                        }
                except Exception:
                    pass

        doc_id = xml_p.parent.name if xml_p.name in ["merged.xml", "merged.json"] else xml_p.stem

        report = self.review_document(
            xml_content=xml_content,
            raw_ocr_text=raw_content,
            doc_id=doc_id,
            file_path=str(xml_p),
            raw_file_path=str(raw_p) if raw_p else None,
            use_llm=use_llm,
        )

        if parser_info:
            report.parser_info = parser_info

        if save_audit_json:
            audit_file_target = (
                (xml_p.parent / "audit_report.json")
                if xml_p.name in ["merged.xml", "merged.json"]
                else xml_p.with_suffix(".audit.json")
            )
            with open(audit_file_target, "w", encoding="utf-8") as f_out:
                json.dump(report.model_dump(), f_out, indent=2, ensure_ascii=False)

        return report

    def discard_document(
        self,
        xml_path: Union[str, Path],
        report: ReviewReport,
        discard_dir: Union[str, Path],
        move_raw: bool = False,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Quarantines / discards a malfunctioned document by moving its directory to discard_dir
        and saving an accompanying audit report JSON.
        """
        xml_p = Path(xml_path).resolve()
        discard_base = Path(discard_dir).resolve()

        if not xml_p.exists():
            return {"success": False, "error": f"File not found: {xml_path}"}

        # Determine target move root
        if xml_p.name in ["merged.xml", "merged.json"]:
            source_folder = xml_p.parent
        else:
            source_folder = xml_p

        # Find relative path structure if inside a known base dir
        rel_path = None
        for known_parent in ["sequence_labelling_annotated", "annotator/out", "data"]:
            if known_parent in str(source_folder):
                parts = str(source_folder).split(known_parent)
                rel_path = parts[-1].lstrip(os.sep)
                break

        if not rel_path:
            rel_path = source_folder.name

        dest_target = discard_base / rel_path
        audit_file_path = (dest_target / "audit_report.json") if dest_target.is_dir() or source_folder.is_dir() else dest_target.with_suffix(".audit.json")

        result = {
            "success": True,
            "dry_run": dry_run,
            "source_path": str(source_folder),
            "destination_path": str(dest_target),
            "audit_file": str(audit_file_path),
            "discard_reasons": report.discard_reasons,
            "overall_score": report.overall_score,
        }

        if dry_run:
            return result

        dest_target.parent.mkdir(parents=True, exist_ok=True)

        # Move source folder / file
        if dest_target.exists():
            if dest_target.is_dir():
                shutil.rmtree(dest_target)
            else:
                dest_target.unlink()

        shutil.move(str(source_folder), str(dest_target))

        # Write audit report JSON
        if dest_target.is_dir():
            audit_file = dest_target / "audit_report.json"
        else:
            audit_file = dest_target.with_suffix(".audit.json")

        with open(audit_file, "w", encoding="utf-8") as f:
            json.dump(report.model_dump(), f, indent=2, ensure_ascii=False)

        # Optionally move raw input file if requested
        if move_raw and report.raw_file_path:
            raw_src = Path(report.raw_file_path)
            if raw_src.exists():
                raw_dest = dest_target.parent / raw_src.name if dest_target.is_dir() else dest_target.with_suffix(raw_src.suffix)
                try:
                    shutil.move(str(raw_src), str(raw_dest))
                    result["raw_moved_to"] = str(raw_dest)
                except Exception as e:
                    result["raw_move_warning"] = str(e)

        return result

    def batch_review(
        self,
        annotated_dir: Union[str, Path],
        raw_dir: Optional[Union[str, Path]] = None,
        discard_dir: Optional[Union[str, Path]] = None,
        auto_discard: bool = False,
        save_audit_json: bool = True,
        use_llm: bool = True,
        concurrency: int = 4,
        output_report_path: Optional[Union[str, Path]] = None,
        progress_callback=None,
    ) -> BatchReviewSummary:
        """
        Performs batch review across all XML documents in a directory.
        Saves progress, Markdown report, and JSON summary on the fly as documents finish.
        """
        start_time = time.time()
        base_dir = Path(annotated_dir)
        if not base_dir.exists():
            raise FileNotFoundError(f"Annotated directory not found: {annotated_dir}")

        # Gather target xml files
        xml_files: List[Path] = []
        for p in base_dir.rglob("*.xml"):
            if p.is_file() and not p.name.startswith("."):
                xml_files.append(p)

        xml_files.sort()
        total_docs = len(xml_files)
        reports: List[ReviewReport] = []
        discarded_paths: List[str] = []
        failure_reasons_distribution: Dict[str, int] = {}

        passed = 0
        needs_revision = 0
        discarded = 0
        total_score_sum = 0.0

        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading

        report_lock = threading.Lock()

        def process_single(xml_p: Path) -> Tuple[ReviewReport, Optional[Dict[str, Any]]]:
            # Locate raw path
            raw_file = None
            if raw_dir:
                rel = xml_p.relative_to(base_dir)
                # Map exam_XXX/merged.xml -> exam_XXX.md
                if rel.name in ["merged.xml", "merged.json"]:
                    candidate = Path(raw_dir) / rel.parent.with_suffix(".md")
                else:
                    candidate = Path(raw_dir) / rel.with_suffix(".md")
                if candidate.exists():
                    raw_file = candidate

            report = self.review_file(
                xml_p,
                raw_path=raw_file,
                use_llm=use_llm,
                save_audit_json=save_audit_json,
            )

            discard_res = None
            if auto_discard and report.decision == ReviewDecision.DISCARD and discard_dir:
                discard_res = self.discard_document(
                    xml_path=xml_p,
                    report=report,
                    discard_dir=discard_dir,
                    move_raw=False,
                    dry_run=False,
                )

            return report, discard_res

        max_workers = max(1, min(concurrency, total_docs)) if total_docs > 0 else 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_file = {executor.submit(process_single, f): f for f in xml_files}

            completed = 0
            for future in as_completed(future_to_file):
                f = future_to_file[future]
                completed += 1
                try:
                    rep, disc_info = future.result()
                    with report_lock:
                        reports.append(rep)
                        total_score_sum += rep.overall_score

                        if rep.decision == ReviewDecision.PASS:
                            passed += 1
                        elif rep.decision == ReviewDecision.NEEDS_REVISION:
                            needs_revision += 1
                        else:
                            discarded += 1
                            discarded_paths.append(str(f))
                            seen_cats_for_doc = set()
                            for r in rep.discard_reasons:
                                cat = r.split("]")[0].lstrip("[") if "]" in r else "OTHER"
                                if cat not in seen_cats_for_doc:
                                    failure_reasons_distribution[cat] = (
                                        failure_reasons_distribution.get(cat, 0) + 1
                                    )
                                    seen_cats_for_doc.add(cat)

                        curr_avg = round(total_score_sum / max(1, len(reports)), 1)
                        curr_duration = round(time.time() - start_time, 2)

                        # On-the-fly report and progress export
                        if output_report_path:
                            partial_summary = BatchReviewSummary(
                                total_documents=total_docs,
                                passed_count=passed,
                                needs_revision_count=needs_revision,
                                discarded_count=discarded,
                                discarded_paths=discarded_paths,
                                average_score=curr_avg,
                                duration_sec=curr_duration,
                                reports=reports,
                                failure_reasons_distribution=failure_reasons_distribution,
                            )
                            # 1. Update Markdown report on the fly
                            self.export_markdown_report(partial_summary, output_report_path)

                            # 2. Update JSON report on the fly
                            out_p = Path(output_report_path)
                            json_report_path = out_p.with_suffix(".json")
                            with open(json_report_path, "w", encoding="utf-8") as f_j:
                                json.dump(partial_summary.model_dump(), f_j, indent=2, ensure_ascii=False)

                            # 3. Update review_progress.json on the fly
                            progress_path = out_p.parent / "review_progress.json"
                            pct = round((completed / max(1, total_docs)) * 100, 1)
                            eta_sec = (
                                round((curr_duration / completed) * (total_docs - completed), 1)
                                if completed > 0
                                else 0.0
                            )
                            prog_payload = {
                                "status": "IN_PROGRESS" if completed < total_docs else "COMPLETED",
                                "total_documents": total_docs,
                                "completed_documents": completed,
                                "progress_percent": pct,
                                "passed_count": passed,
                                "needs_revision_count": needs_revision,
                                "discarded_count": discarded,
                                "average_score": curr_avg,
                                "elapsed_seconds": curr_duration,
                                "eta_seconds": eta_sec,
                                "last_completed_document": rep.doc_id,
                                "last_decision": rep.decision.value,
                                "last_overall_score": rep.overall_score,
                                "updated_at": datetime.now().isoformat(),
                            }
                            with open(progress_path, "w", encoding="utf-8") as f_pr:
                                json.dump(prog_payload, f_pr, indent=2, ensure_ascii=False)

                    if progress_callback:
                        progress_callback(completed, total_docs, rep)

                except Exception as e:
                    print(f"[Reviewer Error] Failed reviewing {f}: {e}")

        avg_score = round(total_score_sum / max(1, len(reports)), 1)
        duration = round(time.time() - start_time, 2)

        final_summary = BatchReviewSummary(
            total_documents=total_docs,
            passed_count=passed,
            needs_revision_count=needs_revision,
            discarded_count=discarded,
            discarded_paths=discarded_paths,
            average_score=avg_score,
            duration_sec=duration,
            reports=reports,
            failure_reasons_distribution=failure_reasons_distribution,
        )

        if output_report_path:
            self.export_markdown_report(final_summary, output_report_path)
            json_report_path = Path(output_report_path).with_suffix(".json")
            with open(json_report_path, "w", encoding="utf-8") as f_j:
                json.dump(final_summary.model_dump(), f_j, indent=2, ensure_ascii=False)

        return final_summary

    @staticmethod
    def export_markdown_report(summary: BatchReviewSummary, output_path: Optional[Union[str, Path]] = None) -> str:
        """
        Renders a clean, formatted Markdown audit summary report with live progress status.
        """
        is_in_progress = len(summary.reports) < summary.total_documents and summary.total_documents > 0
        pct = (len(summary.reports) / max(1, summary.total_documents)) * 100

        status_badge = (
            f"⏳ **IN PROGRESS** (`{len(summary.reports)}/{summary.total_documents}` processed — `{pct:.1f}%`)"
            if is_in_progress
            else f"✅ **COMPLETED** (`{summary.total_documents}` documents)"
        )

        lines = [
            "# 📋 Annotation Quality Audit & Document Review Report",
            "",
            f"- **Status**: {status_badge}",
            f"- **Execution Timestamp**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"- **Documents Reviewed**: `{len(summary.reports)}` / `{summary.total_documents}`",
            f"- **Average Quality Score**: **{summary.average_score:.1f} / 100**",
            f"- **Passed**: `{summary.passed_count}` ({summary.passed_count/max(1, len(summary.reports))*100:.1f}%)",
            f"- **Needs Revision**: `{summary.needs_revision_count}` ({summary.needs_revision_count/max(1, len(summary.reports))*100:.1f}%)",
            f"- **Discarded / Malfunctioned**: `{summary.discarded_count}` ({summary.discarded_count/max(1, len(summary.reports))*100:.1f}%)",
            f"- **Duration / Elapsed**: {summary.duration_sec:.1f}s",
            "",
            "## 📊 Failure Reasons Distribution",
            "",
        ]

        if summary.failure_reasons_distribution:
            lines.append("| Failure Category | Malfunction Count |")
            lines.append("| :--- | :--- |")
            for cat, cnt in sorted(summary.failure_reasons_distribution.items(), key=lambda x: x[1], reverse=True):
                lines.append(f"| `{cat}` | {cnt} |")
        else:
            lines.append("*(No malfunctions detected so far)*")

        lines.extend([
            "",
            "## 📑 Detailed Document Audit Table",
            "",
            "| Document ID | Overall | Det. Score | LLM Score | Grade | Decision | Questions | Verbatim Ret. | Summary / Discard Reason |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ])

        for r in summary.reports:
            symbol_badge = (
                "🟢 PASS"
                if r.decision == ReviewDecision.PASS
                else ("🟡 REVISION" if r.decision == ReviewDecision.NEEDS_REVISION else "🔴 DISCARD")
            )
            q_cnt = r.metrics.get("questions_count", "N/A")
            llm_sc = f"{r.llm_score:.1f}" if r.llm_score is not None else "N/A"
            ret_str = f"{r.metrics.get('retention_ratio'):.1%}" if r.metrics.get("retention_ratio") is not None else "N/A"

            reason_snip = "; ".join(r.discard_reasons[:2]) if r.discard_reasons else (r.summary[:60] + "..." if len(r.summary) > 60 else r.summary)
            reason_snip = reason_snip.replace("\n", " ").replace("|", "\\|")

            lines.append(
                f"| `{r.doc_id}` | **{r.overall_score:.1f}** | {r.deterministic_score:.1f} | {llm_sc} | `{r.grade}` | {symbol_badge} | {q_cnt} | {ret_str} | {reason_snip} |"
            )

        markdown_content = "\n".join(lines) + "\n"

        if output_path:
            out_p = Path(output_path)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            with open(out_p, "w", encoding="utf-8") as f:
                f.write(markdown_content)

        return markdown_content
