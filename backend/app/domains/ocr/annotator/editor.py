"""
Editor Agent for Exam XML Ground-Truth Sequence Labelling.

Utilizes the exact copy of the Parser System Prompt, Schema, Ground-Truth Rules,
and Golden Few-Shot Examples, augmented with the coding-agent Search/Replace diff-block mechanism
(<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE) to surgically repair documents in NEEDS_REVISION status.
"""

from __future__ import annotations

import difflib
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from backend.app.core.config import (
    EDITOR_MODEL,
    EDITOR_PROVIDER,
    EDITOR_THINKING,
    WORKSPACE_DIR,
)
from backend.app.domains.llm.deepseek_client import chat
from backend.app.domains.ocr.annotator.annotate_ocr import (
    clean_llm_response,
    load_few_shot_examples_xml,
)
from backend.app.domains.ocr.annotator.reviewer import (
    AnnotationReviewerAgent,
    AuditIssue,
    DeterministicAuditor,
    ReviewDecision,
    ReviewReport,
)
from backend.app.domains.ocr.annotator.xml_cleaner import XMLCleaner
from backend.app.domains.ocr.parser.long_parser.anchored_xml_llm_parser import (
    STABLE_XML_PARSER_SYSTEM_PROMPT_TEMPLATE,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Search / Replace Diff Block Models & Patcher Engine
# ---------------------------------------------------------------------------

@dataclass
class SearchReplaceBlock:
    """Represents a single surgical Search/Replace block."""
    search_text: str
    replace_text: str
    raw_block: str = ""


class SearchReplacePatcher:
    """
    Precision diff patcher supporting exact, line-trimmed, and normalized-whitespace matching.
    """

    DIFF_BLOCK_PATTERN = re.compile(
        r"<{5,9}\s*SEARCH\s*\r?\n(.*?)\r?\n={5,9}\s*\r?\n(.*?)\r?\n>{5,9}\s*REPLACE",
        re.DOTALL,
    )

    @classmethod
    def parse_blocks(cls, llm_output: str) -> List[SearchReplaceBlock]:
        """
        Parses all <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE blocks from LLM output.
        Handles possible markdown code fence wrappers safely.
        """
        if not llm_output or not llm_output.strip():
            return []

        # Remove outer code fence if entire response was wrapped in ```
        cleaned = clean_llm_response(llm_output).strip()

        blocks: List[SearchReplaceBlock] = []
        for match in cls.DIFF_BLOCK_PATTERN.finditer(cleaned):
            search_content = match.group(1)
            replace_content = match.group(2)
            raw_full = match.group(0)

            # Strip trailing/leading sentinel markers if accidentally inside block
            search_content = search_content.replace("<|END|>", "").rstrip("\r\n")
            replace_content = replace_content.replace("<|END|>", "").rstrip("\r\n")

            if search_content.strip():
                blocks.append(
                    SearchReplaceBlock(
                        search_text=search_content,
                        replace_text=replace_content,
                        raw_block=raw_full,
                    )
                )

        return blocks

    @classmethod
    def apply_blocks(
        cls, original_text: str, blocks: List[SearchReplaceBlock]
    ) -> Tuple[str, int, List[str]]:
        """
        Applies a list of Search/Replace blocks sequentially to original_text.
        Returns:
            (patched_text, applied_count, failed_reasons)
        """
        current_text = original_text
        applied_count = 0
        failed_reasons: List[str] = []

        for idx, block in enumerate(blocks, start=1):
            search_str = block.search_text
            replace_str = block.replace_text

            # Level 1: Exact substring match
            if search_str in current_text:
                current_text = current_text.replace(search_str, replace_str, 1)
                applied_count += 1
                continue

            # Level 2: Line-trimmed normalized match (strip trailing spaces per line)
            search_lines = [line.rstrip() for line in search_str.splitlines()]
            normalized_search = "\n".join(search_lines)

            doc_lines = [line.rstrip() for line in current_text.splitlines()]
            normalized_doc = "\n".join(doc_lines)

            if normalized_search in normalized_doc:
                # Find exact line indices in current_text
                start_line_idx = -1
                for i in range(len(doc_lines) - len(search_lines) + 1):
                    if doc_lines[i : i + len(search_lines)] == search_lines:
                        start_line_idx = i
                        break

                if start_line_idx != -1:
                    orig_raw_lines = current_text.splitlines(keepends=True)
                    end_line_idx = start_line_idx + len(search_lines)
                    
                    # Construct replacement lines
                    rep_lines = [line + "\n" for line in replace_str.splitlines()]
                    if rep_lines and not replace_str.endswith("\n"):
                        rep_lines[-1] = rep_lines[-1].rstrip("\n")

                    patched_lines = (
                        orig_raw_lines[:start_line_idx]
                        + rep_lines
                        + orig_raw_lines[end_line_idx:]
                    )
                    current_text = "".join(patched_lines)
                    applied_count += 1
                    continue

            # Level 3: Fuzzy character-mapped normalized whitespace match
            fuzzy_patched = cls._apply_fuzzy_whitespace_replace(
                current_text, search_str, replace_str
            )
            if fuzzy_patched is not None:
                current_text = fuzzy_patched
                applied_count += 1
                continue

            # If all levels failed, record failure reason
            snippet = search_str[:80].replace("\n", " ")
            failed_reasons.append(
                f"Block #{idx} SEARCH block not found in target XML: '{snippet}...'"
            )

        return current_text, applied_count, failed_reasons

    @staticmethod
    def _apply_fuzzy_whitespace_replace(
        doc_text: str, search_str: str, replace_str: str
    ) -> Optional[str]:
        """
        Replaces flexible whitespace occurrences using linear-time, non-backtracking token matching.
        Eliminates adjacent whitespace quantifiers to prevent ReDoS on large documents.
        """
        if not search_str or not search_str.strip():
            return None

        # Guard against excessively large search blocks that could degrade regex performance
        if len(search_str) > 2500:
            return None

        tokens = [re.escape(t) for t in re.findall(r"\w+|[^\w\s]", search_str.strip()) if t]
        if not tokens or len(tokens) > 300:
            return None

        # Join tokens with flexible whitespace, ensuring NO adjacent or duplicate quantifiers
        pattern = r"\s*".join(tokens)
        pattern = re.sub(r"(\\s[*+])+", r"\\s*", pattern)

        try:
            match = re.search(pattern, doc_text)
            if match:
                return doc_text[: match.start()] + replace_str + doc_text[match.end() :]
        except Exception:
            pass

        return None


# ---------------------------------------------------------------------------
# Editor Result Model
# ---------------------------------------------------------------------------

class EditorResult(BaseModel):
    """Structured result from an Editor Agent document repair run."""
    doc_id: str
    success: bool = False
    initial_score: float = 0.0
    final_score: float = 0.0
    initial_decision: str = "NEEDS_REVISION"
    final_decision: str = "NEEDS_REVISION"
    deterministic_only: bool = False
    applied_patches_count: int = 0
    failed_patches_count: int = 0
    failed_patches_reasons: List[str] = Field(default_factory=list)
    initial_issues_count: int = 0
    remaining_issues_count: int = 0
    repaired_xml: str = ""
    diff_summary: str = ""
    duration_seconds: float = 0.0


# ---------------------------------------------------------------------------
# Role C Surgical Editor Prompt Suffix
# ---------------------------------------------------------------------------

ROLE_C_EDITOR_PROMPT_INSTRUCTION = """
When instructed with "### ACTIVATE ROLE C: SURGICAL EDITOR (SEARCH/REPLACE DIFF BLOCKS)":
You are performing precision surgical repairs on defective sections of the annotated XML based on the provided audit diagnostics and the raw OCR source text.
You must NOT output the entire file. You MUST ONLY output one or more Search/Replace diff blocks formatted EXACTLY as:

<<<<<<< SEARCH
[exact lines from CURRENT_ANNOTATED_XML to replace]
=======
[replacement lines with corrected XML sequence tags matching the Schema & Strict Rules above]
>>>>>>> REPLACE

## ⛔ Surgical Editing Invariants:
1. MINIMAL SURGICAL EDITS: Only output SEARCH/REPLACE blocks for the specific defective questions, stimuli, or options identified in <<<AUDIT_DIAGNOSTICS>>>. Do NOT touch correctly annotated sections.
2. SUB-QUESTION & STATEMENT SEGMENTATION: In essay, constructed-response, or True/False questions where statements (a, b, c, d) were absorbed into <stem>, replace them with structured <option_label>a)</option_label> <option_text>Statement text...</option_text>.
3. STIMULUS ANCHOR ALIGNMENT: Ensure all <stimulus id="..." start_anchor="..." end_anchor="..." /> tags are self-closing with start_anchor and end_anchor matching exact words from <<<RAW_SOURCE_TEXT>>>. A <stimulus> MUST NEVER wrap subsequent questions.
4. QUESTION STRUCTURE & NUMBERING: Wrap unannotated questions in <question_label> and <stem>. Never duplicate question labels.
5. 100% VERBATIM FIDELITY: Ensure replacement text matches the raw OCR source text verbatim with no rewriting.
6. EXACT SEARCH MATCHING: The text inside <<<<<<< SEARCH must match lines in CURRENT_ANNOTATED_XML character-for-character.
"""


# ---------------------------------------------------------------------------
# Editor Agent Core Engine
# ---------------------------------------------------------------------------

class EditorAgent:
    """
    Precision Surgical Editor Agent for Exam XML Ground-Truth Sequence Labelling.
    Embeds the exact copy of the Parser System Prompt, Schema, and Few-Shot Examples,
    and executes Search/Replace diff-block repairs.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        thinking: Optional[str] = None,
    ):
        self.model = model.strip() if model else EDITOR_MODEL
        self.provider = provider.strip() if provider else EDITOR_PROVIDER
        self.thinking = thinking or EDITOR_THINKING or "low"

        # Load exact parser prompt + few-shot examples (100% byte-for-byte exact copy)
        examples_dir = (
            WORKSPACE_DIR
            / "backend"
            / "app"
            / "domains"
            / "ocr"
            / "annotator"
            / "examples"
            / "annotator"
        )
        few_shot_xml = (
            load_few_shot_examples_xml(examples_dir) if examples_dir.exists() else ""
        )

        # Assemble full static system prompt (optimized for 100% prefix prompt caching)
        self.system_prompt = (
            STABLE_XML_PARSER_SYSTEM_PROMPT_TEMPLATE.strip()
            + "\n\n"
            + ROLE_C_EDITOR_PROMPT_INSTRUCTION.strip()
            + "\n\n"
            + few_shot_xml
        ).strip()

        self.reviewer = AnnotationReviewerAgent(
            model=self.model, provider=self.provider, thinking="medium"
        )

    def _format_diagnostics_block(self, issues: List[AuditIssue]) -> str:
        """Formats audit issues into structured diagnostic instructions."""
        if not issues:
            return "No critical or major syntax issues recorded."

        lines = []
        for idx, iss in enumerate(issues, start=1):
            sev = iss.severity.value if hasattr(iss.severity, "value") else str(iss.severity)
            cat = iss.category
            msg = iss.message
            snippet = f" | Context: '{iss.context_snippet}'" if iss.context_snippet else ""
            line_info = f" [Line {iss.line_number}]" if iss.line_number else ""
            lines.append(f"{idx}. [{sev}] ({cat}){line_info}: {msg}{snippet}")

        return "\n".join(lines)

    def repair_document(
        self,
        annotated_xml: str,
        raw_ocr_text: str,
        issues: Optional[List[AuditIssue]] = None,
        doc_id: str = "doc",
        max_attempts: int = 2,
        completion_fn: Optional[Callable[..., str]] = None,
    ) -> EditorResult:
        """
        Surgically repairs an annotated XML document using the 4-Stage Search/Replace Pipeline.
        """
        start_time = time.time()
        complete = completion_fn or chat

        if not annotated_xml or not annotated_xml.strip():
            return EditorResult(
                doc_id=doc_id,
                success=False,
                initial_score=0.0,
                final_score=0.0,
                repaired_xml="",
                duration_seconds=time.time() - start_time,
            )

        # --- Stage 0: Initial Review ---
        initial_report = self.reviewer.review_document(
            xml_content=annotated_xml,
            raw_ocr_text=raw_ocr_text,
            doc_id=doc_id,
            use_llm=False,
        )
        if issues is None:
            issues = initial_report.issues
        initial_score = initial_report.overall_score
        initial_decision = initial_report.decision.value

        initial_issues_count = len(issues)

        # --- Stage 1: Deterministic Pre-Clean ---
        clean_res = XMLCleaner.clean(annotated_xml)
        current_xml = clean_res.cleaned_xml

        # Check if deterministic clean was sufficient to resolve all major/critical issues
        det_issues_after_clean, _ = DeterministicAuditor.check_xml_syntax(current_xml)
        has_critical_or_major_syntax = any(
            (iss.severity.value if hasattr(iss.severity, "value") else str(iss.severity))
            in ["CRITICAL", "MAJOR"]
            for iss in det_issues_after_clean
        )

        semantic_issue_categories = {
            "question_structure",
            "option_structure",
            "stimulus",
            "continuity",
            "schema_conformance",
        }
        has_semantic_issues = any(
            iss.category in semantic_issue_categories and
            (iss.severity.value if hasattr(iss.severity, "value") else str(iss.severity)) in ["CRITICAL", "MAJOR"]
            for iss in issues
        )

        total_applied_patches = 0
        all_failed_reasons: List[str] = []

        # If clean_res changed anything and no semantic issues exist, evaluate if pure deterministic fix suffices
        if not has_semantic_issues and not has_critical_or_major_syntax:
            post_det_report = self.reviewer.review_document(
                xml_content=current_xml,
                raw_ocr_text=raw_ocr_text,
                doc_id=doc_id,
                use_llm=False,
            )
            if post_det_report.overall_score >= 80.0 and post_det_report.decision == ReviewDecision.PASS:
                return EditorResult(
                    doc_id=doc_id,
                    success=True,
                    initial_score=initial_score,
                    final_score=post_det_report.overall_score,
                    initial_decision=initial_decision,
                    final_decision="PASS",
                    deterministic_only=True,
                    applied_patches_count=len(clean_res.fixes_applied),
                    failed_patches_count=0,
                    initial_issues_count=initial_issues_count,
                    remaining_issues_count=len(post_det_report.issues),
                    repaired_xml=current_xml,
                    diff_summary="; ".join(clean_res.fixes_applied) or "Deterministic XMLCleaner normalization applied.",
                    duration_seconds=time.time() - start_time,
                )

        # --- Stage 2 & 3: Iterative Search/Replace Diff-Block LLM Repair ---
        current_issues = issues
        attempt = 0

        while attempt < max_attempts:
            attempt += 1
            diagnostics_str = self._format_diagnostics_block(current_issues)

            # Build user prompt
            est_tokens = max(50, len(current_xml.split()))
            words = len(current_xml.split())

            user_prompt = (
                f"[Document Metrics: ~{est_tokens} estimated tokens, {words} words. "
                f"Your task is to repair the specific defect issues listed in <<<AUDIT_DIAGNOSTICS>>> using Search/Replace diff blocks.]\n\n"
                f"### ACTIVATE ROLE C: SURGICAL EDITOR (SEARCH/REPLACE DIFF BLOCKS)\n\n"
                f"<<<AUDIT_DIAGNOSTICS>>>\n"
                f"{diagnostics_str}\n"
                f"<<<END_DIAGNOSTICS>>>\n\n"
                f"<<<CURRENT_ANNOTATED_XML>>>\n"
                f"{current_xml}\n"
                f"<<<END_CURRENT_XML>>>\n\n"
                f"<<<RAW_SOURCE_TEXT>>>\n"
                f"{raw_ocr_text}\n"
                f"<<<END_RAW_SOURCE_TEXT>>>\n\n"
                f"Output ONLY Search/Replace diff blocks (<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE) to fix the diagnostics above."
            )

            messages = [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt},
            ]

            llm_output = complete(
                messages=messages,
                model=self.model,
                provider=self.provider,
                thinking=self.thinking,
            )

            diff_blocks = SearchReplacePatcher.parse_blocks(llm_output or "")
            if not diff_blocks:
                logger.warning(
                    f"[EditorAgent] Attempt {attempt} returned 0 valid Search/Replace blocks for {doc_id}."
                )
                break

            patched_xml, applied_count, failed_reasons = SearchReplacePatcher.apply_blocks(
                current_xml, diff_blocks
            )
            total_applied_patches += applied_count
            all_failed_reasons.extend(failed_reasons)

            # Post-clean and rebalance tags
            post_clean = XMLCleaner.clean(patched_xml)
            current_xml = post_clean.cleaned_xml

            # Re-evaluate with DocumentReviewer
            eval_report = self.reviewer.review_document(
                xml_content=current_xml,
                raw_ocr_text=raw_ocr_text,
                doc_id=doc_id,
                use_llm=False,
            )

            current_issues = eval_report.issues
            if eval_report.overall_score >= 80.0 and eval_report.decision == ReviewDecision.PASS:
                break

        # --- Stage 4: Final Quality Verification ---
        final_report = self.reviewer.review_document(
            xml_content=current_xml,
            raw_ocr_text=raw_ocr_text,
            doc_id=doc_id,
            use_llm=False,
        )

        final_score = final_report.overall_score
        final_decision = final_report.decision.value
        is_success = final_decision == "PASS" or (final_score >= 80.0 and not final_report.is_malfunctioned)

        # Generate unified diff summary
        diff_lines = list(
            difflib.unified_diff(
                annotated_xml.splitlines(keepends=True),
                current_xml.splitlines(keepends=True),
                fromfile="before_edit.xml",
                tofile="after_edit.xml",
                n=2,
            )
        )
        diff_summary = "".join(diff_lines[:40])
        if len(diff_lines) > 40:
            diff_summary += f"\n... [{len(diff_lines) - 40} more diff lines]"

        return EditorResult(
            doc_id=doc_id,
            success=is_success,
            initial_score=initial_score,
            final_score=final_score,
            initial_decision=initial_decision,
            final_decision="PASS" if is_success else final_decision,
            deterministic_only=False,
            applied_patches_count=total_applied_patches,
            failed_patches_count=len(all_failed_reasons),
            failed_patches_reasons=all_failed_reasons,
            initial_issues_count=initial_issues_count,
            remaining_issues_count=len(final_report.issues),
            repaired_xml=current_xml,
            diff_summary=diff_summary,
            duration_seconds=time.time() - start_time,
        )
