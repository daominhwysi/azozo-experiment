"""
Deterministic XML Cleaner & Tag Auto-Repairer for OCR Sequence Labeling Outputs.

Repairs:
1. False-positive math inequality tags (e.g. `<0>`, `<1>`, `<24>`, `$x < 0$`).
2. HTML table tag hierarchies (auto-closes unclosed `<td>`/`<th>` before `</tr>`, and `</tr>` before `</table>`, with full nested table scope support).
3. Obsolete HTML presentation tags (`<center>`, `<font>`, `<footer>`, `<header>`).
4. Prohibited page boundary and metadata tags (`<pages>`, `<page>`, `<page_metadata>`, `<think>`).
5. Dangling unclosed sequence tags at question and section boundaries.
6. Normalizes self-closing tags (`<stimulus ... />`, `<figure ... />`, `<br />`).
7. Removes orphaned/unexpected closing tags.
"""

import os
import re
import sys
import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set, Any, Union

# Ensure workspace root is in sys.path
_repo_root = Path(__file__).resolve().parents[5]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from backend.app.domains.ocr.annotator.xml_checker import (
    XMLChecker,
    XMLValidationResult,
    SEQUENCE_PAIRED_TAGS,
    HTML_FORMATTING_TAGS,
    ALLOWED_PAIRED_TAGS,
    ALLOWED_SELF_CLOSING_TAGS,
    PROHIBITED_TAGS,
)


@dataclass
class CleanResult:
    original_xml: str
    cleaned_xml: str
    is_modified: bool
    is_valid_before: bool
    is_valid_after: bool
    fixes_applied: List[str] = field(default_factory=list)
    remaining_issues: List[str] = field(default_factory=list)
    file_path: Optional[str] = None

    def summary(self) -> str:
        status = "🟢 FIXED (Valid)" if self.is_valid_after else ("🟡 MODIFIED (Remaining Issues)" if self.is_modified else "⚪ UNMODIFIED")
        lines = [f"{status} {self.file_path or ''}"]
        for fix in self.fixes_applied:
            lines.append(f"  ✓ {fix}")
        for rem in self.remaining_issues:
            lines.append(f"  ✗ {rem}")
        return "\n".join(lines)


class XMLCleaner:
    """
    High-speed deterministic XML cleaner and repair engine.
    Uses multi-stage regex pre-processing followed by scope-aware stack-based tag rebalancing.
    """

    BOUNDARY_START_TAGS = {"question_label", "section", "stimulus"}
    QUESTION_CONTAINER_TAGS = {"stem", "option_label", "option_text", "explanation", "section"}

    @classmethod
    def clean(
        cls,
        xml_content: str,
        file_path: Optional[str] = None,
    ) -> CleanResult:
        """
        Cleans and repairs XML content deterministically.
        """
        if not xml_content or not xml_content.strip():
            return CleanResult(
                original_xml=xml_content,
                cleaned_xml=xml_content,
                is_modified=False,
                is_valid_before=False,
                is_valid_after=False,
                fixes_applied=[],
                remaining_issues=["Empty document content"],
                file_path=file_path,
            )

        fixes: List[str] = []
        text = xml_content

        # Initial validation state
        val_before = XMLChecker.check(text, file_path=file_path)
        if val_before.is_valid:
            # Already valid, return untouched
            return CleanResult(
                original_xml=xml_content,
                cleaned_xml=xml_content,
                is_modified=False,
                is_valid_before=True,
                is_valid_after=True,
                fixes_applied=[],
                remaining_issues=[],
                file_path=file_path,
            )

        # Stage 1: Strip prohibited page and metadata tags
        text, p_fixes = cls._strip_prohibited_tags(text)
        fixes.extend(p_fixes)

        # Stage 2: Strip obsolete presentation tags (<center>, <font>, <footer>)
        text, pres_fixes = cls._strip_presentation_tags(text)
        fixes.extend(pres_fixes)

        # Stage 3: Repair false math inequality tags (<0>, <1>, <24>, etc.)
        text, math_fixes = cls._fix_math_inequalities(text)
        fixes.extend(math_fixes)

        # Stage 4: Normalize self-closing tags (<stimulus ... />, <figure ... />, <br />)
        text, self_fixes = cls._normalize_self_closing(text)
        fixes.extend(self_fixes)

        # Stage 5: Scope-Aware Structural Stack-Based Rebalancing
        text, stack_fixes = cls._rebalance_tag_structure(text)
        fixes.extend(stack_fixes)

        # Final validation state
        val_after = XMLChecker.check(text, file_path=file_path)
        is_modified = text != xml_content

        return CleanResult(
            original_xml=xml_content,
            cleaned_xml=text,
            is_modified=is_modified,
            is_valid_before=val_before.is_valid,
            is_valid_after=val_after.is_valid,
            fixes_applied=fixes,
            remaining_issues=val_after.error_messages,
            file_path=file_path,
        )

    @classmethod
    def _strip_prohibited_tags(cls, text: str) -> Tuple[str, List[str]]:
        fixes = []
        # Page metadata JSON blocks
        if re.search(r"<page_metadata>[\s\S]*?</page_metadata>", text, flags=re.IGNORECASE):
            text = re.sub(r"<page_metadata>[\s\S]*?</page_metadata>", "", text, flags=re.IGNORECASE)
            fixes.append("Pruned <page_metadata>...</page_metadata> blocks")

        # Prohibited standalone tags
        for tag in ["page_metadata", "pages", "page", "think"]:
            pattern = re.compile(rf"</?{tag}(?:\s+[^>]*)?>", flags=re.IGNORECASE)
            if pattern.search(text):
                text = pattern.sub("", text)
                fixes.append(f"Stripped prohibited <{tag}> tags")

        return text, fixes

    @classmethod
    def _strip_presentation_tags(cls, text: str) -> Tuple[str, List[str]]:
        fixes = []
        presentation_tags = ["center", "font", "footer", "header"]
        for tag in presentation_tags:
            pattern = re.compile(rf"</?{tag}(?:\s+[^>]*)?>", flags=re.IGNORECASE)
            if pattern.search(text):
                text = pattern.sub("", text)
                fixes.append(f"Stripped presentation tag <{tag}>")
        return text, fixes

    @classmethod
    def _fix_math_inequalities(cls, text: str) -> Tuple[str, List[str]]:
        fixes = []
        # Match angle brackets around pure numbers like <0>, <1>, <24>, </0>, </1>
        numeric_tag_pattern = re.compile(r"<(/)?\s*(-?\d+(?:\.\d+)?)\s*(/?)>")
        if numeric_tag_pattern.search(text):
            def repl_num(m):
                is_close = m.group(1)
                num = m.group(2)
                if is_close:
                    return f" / {num}"
                return f" < {num}"

            text = numeric_tag_pattern.sub(repl_num, text)
            fixes.append("Converted false numeric math inequality tags (e.g. <0>, <24>) to literal math text")

        return text, fixes

    @classmethod
    def _normalize_self_closing(cls, text: str) -> Tuple[str, List[str]]:
        fixes = []
        # Normalize <stimulus ...> or <figure ...> without closing slash
        pattern = re.compile(r"<(stimulus|figure)(\s+[^>]*?)(?<!/)>", flags=re.IGNORECASE)
        if pattern.search(text):
            text = pattern.sub(r"<\1\2 />", text)
            fixes.append("Normalized self-closing <stimulus /> and <figure /> tags")

        # Normalize void html tags like <br>, <hr>, <img>
        for void_tag in ["br", "hr", "img", "col", "wbr"]:
            void_pattern = re.compile(rf"<({void_tag})(\s*[^>]*?)(?<!/)>", flags=re.IGNORECASE)
            if void_pattern.search(text):
                text = void_pattern.sub(r"<\1\2 />", text)
                fixes.append(f"Normalized <{void_tag} /> void tags")

        return text, fixes

    @classmethod
    def _get_current_table_scope_index(cls, tag_stack: List[str]) -> Optional[int]:
        """Returns the index of the last 'table' tag in tag_stack, or None if not inside a table."""
        for i in range(len(tag_stack) - 1, -1, -1):
            if tag_stack[i] == "table":
                return i
        return None

    @classmethod
    def _rebalance_tag_structure(cls, text: str) -> Tuple[str, List[str]]:
        """
        Robust scope-aware stack-based tag rebalancer for sequence and nested HTML table structures.
        """
        fixes: List[str] = []

        has_end_delimiter = "<|END|>" in text
        text_body = text.replace("<|END|>", "").rstrip()

        # Attribute-quote-aware tag regex
        tag_pattern = re.compile(r'<(/)?([a-zA-Z_0-9\-]+)(?:\s+((?:[^"\'>]|"[^"]*"|\'[^\']*\')*))?(/)?>')

        tokens: List[str] = []
        last_idx = 0
        tag_stack: List[str] = []

        for match in tag_pattern.finditer(text_body):
            start, end = match.span()
            raw_tag = match.group(0)
            is_closing = bool(match.group(1))
            tag_name = match.group(2).lower()
            attrs_str = match.group(3) or ""
            is_self_closing = (
                bool(match.group(4))
                or attrs_str.strip().endswith("/")
                or tag_name in ALLOWED_SELF_CLOSING_TAGS
                or raw_tag.endswith("/>")
            )

            # Append text before this tag
            tokens.append(text_body[last_idx:start])

            if is_self_closing:
                tokens.append(raw_tag)
                last_idx = end
                continue

            if not is_closing:
                # ── OPENING TAG HANDLING ──

                # 1. Question Boundary: Close any open question item when a new boundary starts
                if tag_name in cls.BOUNDARY_START_TAGS:
                    while tag_stack and tag_stack[-1] in cls.QUESTION_CONTAINER_TAGS:
                        dangling = tag_stack.pop()
                        tokens.append(f"</{dangling}>\n")
                        fixes.append(f"Auto-closed unclosed <{dangling}> before <{tag_name}> boundary")

                # 2. Scope-Aware Table Formatting
                table_idx = cls._get_current_table_scope_index(tag_stack)

                if tag_name == "tr" and table_idx is not None:
                    # In current table scope: close any open td/th and previous tr
                    while len(tag_stack) > table_idx + 1:
                        top = tag_stack[-1]
                        if top in ["td", "th", "tr"] or top in cls.QUESTION_CONTAINER_TAGS or top in ["b", "i", "u", "span"]:
                            tokens.append(f"</{top}>")
                            tag_stack.pop()
                            fixes.append(f"Auto-closed <{top}> before next <tr>")
                        else:
                            break

                elif tag_name in ["td", "th"] and table_idx is not None:
                    # In current table scope: if td/th is already open, close it and all inner tags
                    has_cell = False
                    for k in range(table_idx + 1, len(tag_stack)):
                        if tag_stack[k] in ["td", "th"]:
                            has_cell = True
                            break

                    if has_cell:
                        while len(tag_stack) > table_idx + 1:
                            top = tag_stack[-1]
                            tokens.append(f"</{top}>")
                            tag_stack.pop()
                            fixes.append(f"Auto-closed <{top}> before next <{tag_name}>")
                            if top in ["td", "th"]:
                                break

                    # If no tr in current table scope, open tr
                    has_tr = False
                    for k in range(table_idx + 1, len(tag_stack)):
                        if tag_stack[k] == "tr":
                            has_tr = True
                            break
                    if not has_tr:
                        tokens.append("<tr>")
                        tag_stack.append("tr")
                        fixes.append(f"Auto-opened <tr> before <{tag_name}> inside <table>")

                tag_stack.append(tag_name)
                tokens.append(raw_tag)

            else:
                # ── CLOSING TAG HANDLING ──

                # Case A: Exact match at top of stack
                if tag_stack and tag_stack[-1] == tag_name:
                    tag_stack.pop()
                    tokens.append(raw_tag)

                # Case B: Tag exists lower in the stack (e.g. </td> or </tr> or </table> omitted)
                elif tag_name in tag_stack:
                    while tag_stack and tag_stack[-1] != tag_name:
                        inner = tag_stack.pop()
                        tokens.append(f"</{inner}>")
                        fixes.append(f"Auto-closed inner tag <{inner}> before </{tag_name}>")
                    if tag_stack and tag_stack[-1] == tag_name:
                        tag_stack.pop()
                        tokens.append(raw_tag)

                # Case C: Tag does not exist in stack
                else:
                    # Check for direct pair mismatch between sequence tags
                    if tag_stack and tag_stack[-1] == "stem" and tag_name == "option_text":
                        tag_stack.pop()
                        tokens.append("</stem>")
                        fixes.append("Corrected mismatched closing tag </option_text> to </stem>")
                    elif tag_stack and tag_stack[-1] == "option_text" and tag_name == "stem":
                        tag_stack.pop()
                        tokens.append("</option_text>")
                        fixes.append("Corrected mismatched closing tag </stem> to </option_text>")
                    elif tag_stack and tag_stack[-1] == "option_label" and tag_name == "option_text":
                        tag_stack.pop()
                        tokens.append("</option_label>")
                        fixes.append("Corrected mismatched closing tag </option_text> to </option_label>")
                    elif tag_stack and tag_stack[-1] == "option_text" and tag_name == "option_label":
                        tag_stack.pop()
                        tokens.append("</option_text>")
                        fixes.append("Corrected mismatched closing tag </option_label> to </option_text>")
                    else:
                        # Orphaned closing tag without open tag -> drop it safely
                        fixes.append(f"Removed orphaned unexpected closing tag </{tag_name}>")

            last_idx = end

        tokens.append(text_body[last_idx:])

        # Close any remaining open tags in reverse stack order
        while tag_stack:
            unclosed = tag_stack.pop()
            tokens.append(f"</{unclosed}>\n")
            fixes.append(f"Auto-closed dangling tag <{unclosed}> at EOF")

        repaired_text = "".join(tokens).rstrip()
        if has_end_delimiter:
            repaired_text += "\n<|END|>"

        return repaired_text, fixes

    @classmethod
    def clean_file(
        cls,
        file_path: Union[str, Path],
        write_in_place: bool = False,
        backup: bool = False,
    ) -> CleanResult:
        """
        Cleans and repairs a single XML file.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        raw_content = path.read_text(encoding="utf-8")
        result = cls.clean(raw_content, file_path=str(path))

        if write_in_place and result.is_modified:
            if backup:
                backup_p = path.with_suffix(".xml.bak")
                backup_p.write_text(raw_content, encoding="utf-8")
            path.write_text(result.cleaned_xml, encoding="utf-8")

        return result

    @classmethod
    def batch_clean(
        cls,
        target_dir: Union[str, Path],
        write_in_place: bool = False,
        backup: bool = False,
        recursive: bool = True,
        only_failing: bool = True,
    ) -> Dict[str, Any]:
        """
        Batch clean all XML files in target directory.
        """
        target_p = Path(target_dir)
        xml_files = list(target_p.glob("**/*.xml")) if recursive else list(target_p.glob("*.xml"))

        total = len(xml_files)
        already_valid = 0
        fixed_count = 0
        still_failing_count = 0
        modified_count = 0

        results: List[CleanResult] = []

        for xml_p in xml_files:
            content = xml_p.read_text(encoding="utf-8")
            val_init = XMLChecker.check(content, file_path=str(xml_p))

            if only_failing and val_init.is_valid:
                already_valid += 1
                continue

            res = cls.clean_file(xml_p, write_in_place=write_in_place, backup=backup)
            results.append(res)

            if res.is_modified:
                modified_count += 1

            if res.is_valid_after:
                fixed_count += 1
            else:
                still_failing_count += 1

        return {
            "total_files": total,
            "already_valid": already_valid,
            "modified_count": modified_count,
            "fixed_count": fixed_count,
            "still_failing_count": still_failing_count,
            "results": results,
        }


def main():
    parser = argparse.ArgumentParser(
        description="Azozo Deterministic XML Cleaner & Tag Auto-Repairer"
    )
    parser.add_argument(
        "target",
        type=str,
        help="Path to an XML file or directory containing XML files to clean",
    )
    parser.add_argument(
        "--write",
        "-w",
        action="store_true",
        help="Write repaired XML content in-place to files (default: False / Dry Run)",
    )
    parser.add_argument(
        "--backup",
        "-b",
        action="store_true",
        help="Create .bak backup before overwriting files",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all files including already-passing ones (default: only processes failing files)",
    )
    parser.add_argument(
        "--quiet",
        "-q",
        action="store_true",
        help="Only display summary metrics and unresolved files",
    )
    args = parser.parse_args()

    target_path = Path(args.target)
    if not target_path.exists():
        print(f"❌ Error: Target path '{args.target}' does not exist.")
        sys.exit(1)

    print("=" * 70)
    print("🧹 AZOZO DETERMINISTIC XML CLEANER & TAG AUTO-REPAIRER")
    print("=" * 70)
    print(f"  Target Path   : {args.target}")
    print(f"  Mode          : {'IN-PLACE REPAIR (--write)' if args.write else 'DRY RUN (Simulate only)'}")
    print(f"  Backup .bak   : {'ENABLED' if args.backup else 'DISABLED'}")
    print("=" * 70)

    if target_path.is_file():
        res = XMLCleaner.clean_file(target_path, write_in_place=args.write, backup=args.backup)
        print("\n" + res.summary())
        sys.exit(0 if res.is_valid_after else 1)
    else:
        summary = XMLCleaner.batch_clean(
            target_path,
            write_in_place=args.write,
            backup=args.backup,
            only_failing=not args.all,
        )

        print(f"\n📊 BATCH CLEANING SUMMARY:")
        print(f"  - Total Scanned     : {summary['total_files']}")
        print(f"  - Already Valid     : {summary['already_valid']}")
        print(f"  - Modified / Fixed  : {summary['modified_count']}")
        print(f"  - Now Valid (Pass)  : {summary['already_valid'] + summary['fixed_count']} / {summary['total_files']}")
        print(f"  - Still Failing     : {summary['still_failing_count']}")
        print("=" * 70)

        if summary["still_failing_count"] > 0 and not args.quiet:
            print("\n🚨 Files requiring targeted Editor Agent / manual inspection:")
            for r in summary["results"]:
                if not r.is_valid_after:
                    print(f"  • {r.file_path}")
                    for issue in r.remaining_issues[:2]:
                        print(f"    - {issue}")

        sys.exit(0 if summary["still_failing_count"] == 0 else 1)


if __name__ == "__main__":
    main()
