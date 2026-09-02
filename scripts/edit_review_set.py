#!/usr/bin/env python3
"""
CLI Runner for isolated Editor/Reviewer revision loops.

Discovers all documents in NEEDS_REVISION status from review_report.json,
applies deterministic and targeted LLM surgical repairs, validates score elevation,
and optionally saves repaired ground truth to merged.xml and merged.json.
"""

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Set

# Ensure workspace root is in sys.path
_repo_root = Path(__file__).resolve().parent.parent
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from tqdm import tqdm

from backend.app.core.config import (
    EDITOR_MODEL,
    EDITOR_PROVIDER,
    REVIEWER_MODEL,
    REVIEWER_PROVIDER,
    WORKSPACE_DIR,
    get_provider_base_url,
)
from backend.app.domains.ocr.annotator.editor import EditorAgent
from backend.app.domains.ocr.annotator.reviewer import (
    AnnotationReviewerAgent,
    AuditIssue,
    IssueSeverity,
)
from backend.app.domains.ocr.annotator.revision_loop import EditorReviewerLoop
from backend.app.domains.ocr.parser.parser import parse_spans_into_structured_questions
from backend.app.domains.ocr.parser.long_parser.anchored_xml_llm_parser import (
    parse_xml_with_anchors,
)


def load_revision_targets(
    report_path: Path,
    raw_dir: Path,
    annotated_dir: Path,
    decisions: Set[str],
) -> List[Dict[str, Any]]:
    """Load documents matching the requested review decisions."""
    json_path = report_path.with_suffix(".json") if report_path.suffix == ".md" else report_path
    if not json_path.exists():
        print(f"❌ Error: Report file '{json_path}' not found.")
        return []

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    targets = []
    reports = data.get("reports", [])

    for r in reports:
        if r.get("decision") not in decisions:
            continue

        doc_id = r.get("doc_id")
        xml_p = r.get("file_path")
        raw_p = r.get("raw_file_path")

        xml_path = Path(xml_p) if xml_p else None
        if not (xml_path and xml_path.exists()):
            # Try to resolve relative to annotated_dir
            for cand in [
                annotated_dir / f"{doc_id}/merged.xml",
                annotated_dir / f"{doc_id}.xml",
            ]:
                if cand.exists():
                    xml_path = cand
                    break

        raw_path = Path(raw_p) if raw_p else None
        if not (raw_path and raw_path.exists()):
            # Try to resolve relative to raw_dir
            if xml_path:
                try:
                    rel_to_annot = xml_path.relative_to(annotated_dir.resolve())
                except ValueError:
                    rel_to_annot = Path(xml_p)
                    if str(rel_to_annot).startswith("data/sequence_labelling_annotated/"):
                        rel_to_annot = Path(str(rel_to_annot)[len("data/sequence_labelling_annotated/"):])

                doc_stem = rel_to_annot.parent if rel_to_annot.name in ["merged.xml", "merged.json"] else rel_to_annot.with_suffix("")
                cand_raw = raw_dir / f"{doc_stem}.md"
                if cand_raw.exists():
                    raw_path = cand_raw

        if xml_path and xml_path.exists() and raw_path and raw_path.exists():
            issues_raw = r.get("issues", [])
            parsed_issues = []
            for iss in issues_raw:
                parsed_issues.append(
                    AuditIssue(
                        category=iss.get("category", "general"),
                        severity=IssueSeverity(iss.get("severity", "MAJOR")),
                        message=iss.get("message", ""),
                        line_number=iss.get("line_number"),
                        context_snippet=iss.get("context_snippet"),
                    )
                )

            targets.append({
                "doc_id": doc_id,
                "source_decision": r.get("decision"),
                "xml_path": xml_path.resolve(),
                "raw_path": raw_path.resolve(),
                "rel_path": raw_path.resolve().relative_to(raw_dir.resolve()),
                "initial_score": r.get("overall_score", 0.0),
                "issues": parsed_issues,
            })
        else:
            print(f"⚠️ [Warning] Skipping '{doc_id}': could not locate XML ({xml_path}) or Raw ({raw_path})")

    return targets


def parse_args():
    parser = argparse.ArgumentParser(
        description="Batch Revision Resolution Engine using EditorAgent (Search/Replace Diff Blocks)"
    )
    parser.add_argument(
        "--report",
        "-r",
        type=str,
        default="backend/logs/review_report.json",
        help="Path to review report JSON (default: backend/logs/review_report.json)",
    )
    parser.add_argument(
        "--raw-dir",
        type=str,
        default=str(WORKSPACE_DIR / "data" / "sequence_labelling_input_data"),
        help="Path to raw markdown directory (default: data/sequence_labelling_input_data)",
    )
    parser.add_argument(
        "--annotated-dir",
        type=str,
        default=str(WORKSPACE_DIR / "data" / "sequence_labelling_annotated"),
        help="Path to annotated XML directory (default: data/sequence_labelling_annotated)",
    )
    parser.add_argument(
        "--doc-id",
        "--target-doc",
        dest="target_doc",
        type=str,
        default=None,
        help="Filter resolution to a specific document ID or substring (e.g. exam_254)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=EDITOR_MODEL,
        help=f"Editor model name (default: {EDITOR_MODEL})",
    )
    parser.add_argument(
        "--provider",
        type=str,
        default=EDITOR_PROVIDER,
        help=f"Editor LLM provider (default: {EDITOR_PROVIDER})",
    )
    parser.add_argument(
        "--reviewer-model",
        type=str,
        default=REVIEWER_MODEL,
        help=f"Reviewer model name (default: {REVIEWER_MODEL})",
    )
    parser.add_argument(
        "--reviewer-provider",
        type=str,
        default=REVIEWER_PROVIDER,
        help=f"Reviewer provider (default: {REVIEWER_PROVIDER})",
    )
    parser.add_argument(
        "--concurrency",
        "-c",
        type=int,
        default=4,
        help="Concurrency worker threads (default: 4)",
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=None,
        help="Limit number of documents to repair",
    )
    parser.add_argument(
        "--max-passes",
        "--max-rounds",
        dest="max_passes",
        type=int,
        default=2,
        help="Maximum repair passes per document (default: 2)",
    )
    parser.add_argument(
        "--filter",
        "--only",
        dest="filter_decision",
        default="needs_revision",
        help=(
            "Review decisions to repair: needs_revision, discards, or "
            "discards,needs_revision (default: needs_revision)"
        ),
    )
    parser.add_argument(
        "--auto-save",
        action="store_true",
        help="Automatically overwrite merged.xml and update merged.json on success",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate repairs in memory without writing to disk",
    )
    parser.add_argument(
        "--out-report",
        type=str,
        default="backend/logs/revision_resolution_report.json",
        help="Path to output resolution report JSON (default: backend/logs/revision_resolution_report.json)",
    )
    return parser.parse_args()


def process_single_revision(
    target: Dict[str, Any],
    revision_loop: EditorReviewerLoop,
    auto_save: bool,
    dry_run: bool,
) -> Dict[str, Any]:
    """Processes repair for a single document target."""
    doc_id = target["doc_id"]
    xml_path: Path = target["xml_path"]
    raw_path: Path = target["raw_path"]
    issues: List[AuditIssue] = target["issues"]

    annotated_xml = xml_path.read_text(encoding="utf-8")
    raw_ocr_text = raw_path.read_text(encoding="utf-8")

    res = revision_loop.run(
        annotated_xml=annotated_xml,
        raw_ocr_text=raw_ocr_text,
        issues=issues,
        doc_id=doc_id,
    )

    saved = False
    if auto_save and not dry_run and res.success and res.repaired_xml:
        # Write repaired XML
        xml_path.write_text(res.repaired_xml, encoding="utf-8")

        # Update accompanying merged.json if it exists
        json_path = xml_path.with_name("merged.json")
        if json_path.exists():
            try:
                spans, stimuli, questions = parse_xml_with_anchors(
                    raw_ocr_text, res.repaired_xml
                )
                json_data = {
                    "document_id": doc_id,
                    "repaired_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "questions_count": len(questions),
                    "questions": questions,
                    "stimuli": stimuli,
                }
                json_path.write_text(
                    json.dumps(json_data, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            except Exception as e:
                print(f"⚠️ [Warning] Could not update {json_path}: {e}")

        saved = True

    return {
        "doc_id": doc_id,
        "source_decision": target["source_decision"],
        "rel_path": str(target["rel_path"]),
        "initial_score": res.initial_score,
        "final_score": res.final_score,
        "initial_decision": res.initial_decision,
        "final_decision": res.final_decision,
        "success": res.success,
        "applied_patches": res.applied_patches_count,
        "failed_patches": res.failed_patches_count,
        "rounds_completed": res.rounds_completed,
        "rounds": [round_result.model_dump(mode="json") for round_result in res.rounds],
        "saved_to_disk": saved,
        "duration_seconds": res.duration_seconds,
        "diff_summary": res.diff_summary,
    }


def main():
    args = parse_args()

    if args.model:
        args.model = args.model.strip()
    if args.provider:
        args.provider = args.provider.strip()
    if args.reviewer_model:
        args.reviewer_model = args.reviewer_model.strip()
    if args.reviewer_provider:
        args.reviewer_provider = args.reviewer_provider.strip()

    decision_aliases = {
        "needs_revision": "NEEDS_REVISION",
        "revision": "NEEDS_REVISION",
        "discards": "DISCARD",
        "discard": "DISCARD",
    }
    requested_decisions = {
        decision_aliases.get(value.strip().lower(), value.strip().upper())
        for value in args.filter_decision.split(",")
        if value.strip()
    }
    allowed_decisions = {"NEEDS_REVISION", "DISCARD"}
    if not requested_decisions or not requested_decisions <= allowed_decisions:
        raise SystemExit(
            "error: --filter must be needs_revision, discards, or "
            "discards,needs_revision"
        )

    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = WORKSPACE_DIR / report_path

    raw_dir = Path(args.raw_dir)
    if not raw_dir.is_absolute():
        raw_dir = WORKSPACE_DIR / raw_dir

    annotated_dir = Path(args.annotated_dir)
    if not annotated_dir.is_absolute():
        annotated_dir = WORKSPACE_DIR / annotated_dir

    targets = load_revision_targets(
        report_path,
        raw_dir,
        annotated_dir,
        decisions=requested_decisions,
    )

    if args.target_doc:
        query = args.target_doc.strip()
        targets = [
            t for t in targets
            if query in t["doc_id"] or query in str(t["rel_path"])
        ]

    if args.limit:
        targets = targets[: args.limit]

    base_url = get_provider_base_url(args.provider)

    print("=" * 70)
    print("🛠️  AZOZO EDITOR / REVIEWER REVISION LOOP")
    print("=" * 70)
    print(f"  Source Report   : {report_path}")
    print(f"  Raw Input Dir   : {raw_dir}")
    print(f"  Annotated Dir   : {annotated_dir}")
    print(f"  Total Targets   : {len(targets)} document(s)")
    print(f"  Decision Filter : {', '.join(sorted(requested_decisions))}")
    print(f"  Editor Model    : {args.model}")
    print(f"  Editor Provider : {args.provider}")
    print(f"  Reviewer Model  : {args.reviewer_model}")
    print(f"  Reviewer Provider: {args.reviewer_provider}")
    print(f"  Base URL        : {base_url if base_url else '(Codex / SDK Native)'}")
    print(f"  Concurrency     : {args.concurrency} worker thread(s)")
    print(f"  Auto-Save       : {'ENABLED' if args.auto_save else 'DISABLED (Report Only)'}")
    print(f"  Mode            : {'DRY RUN (In-Memory)' if args.dry_run else 'LIVE REPAIR'}")
    print("=" * 70)

    if not targets:
        print("✅ No target documents found to repair.")
        sys.exit(0)

    editor = EditorAgent(model=args.model, provider=args.provider)
    reviewer = AnnotationReviewerAgent(
        model=args.reviewer_model,
        provider=args.reviewer_provider,
    )
    revision_loop = EditorReviewerLoop(
        editor=editor,
        reviewer=reviewer,
        max_rounds=args.max_passes,
    )
    results = []
    success_count = 0
    fail_count = 0

    pbar = tqdm(total=len(targets), desc="Resolving Revisions", unit="doc")

    max_workers = max(1, min(args.concurrency, len(targets)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                process_single_revision,
                target,
                revision_loop,
                args.auto_save,
                args.dry_run,
            ): target
            for target in targets
        }

        for future in as_completed(futures):
            target = futures[future]
            doc_id = target["doc_id"]
            try:
                res = future.result()
                results.append(res)
                if res["success"]:
                    success_count += 1
                    tqdm.write(
                        f"  ✅ [Repaired] {doc_id}: {res['initial_score']:.1f} ({res['initial_decision']}) -> {res['final_score']:.1f} ({res['final_decision']}) [{res['applied_patches']} patches in {res['duration_seconds']:.1f}s]"
                    )
                else:
                    fail_count += 1
                    tqdm.write(
                        f"  ⚠️ [Partial/Unresolved] {doc_id}: {res['initial_score']:.1f} -> {res['final_score']:.1f} ({res['final_decision']})"
                    )
            except Exception as e:
                fail_count += 1
                tqdm.write(f"\n❌ [Error] Failed repairing {doc_id}: {e}")

            pbar.update(1)
            pbar.set_postfix({"ok": success_count, "fail": fail_count})

    pbar.close()

    # Save resolution report JSON
    out_rep_path = Path(args.out_report)
    if not out_rep_path.is_absolute():
        out_rep_path = WORKSPACE_DIR / out_rep_path
    out_rep_path.parent.mkdir(parents=True, exist_ok=True)

    summary_data = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total_targets": len(targets),
        "success_count": success_count,
        "fail_count": fail_count,
        "success_rate": round(success_count / max(1, len(targets)) * 100, 1),
        "auto_save": args.auto_save,
        "results": results,
    }

    out_rep_path.write_text(
        json.dumps(summary_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n" + "=" * 70)
    print("🎉 REVISION RESOLUTION COMPLETED!")
    print(f"  Total Targets Processed : {len(targets)}")
    print(f"  Successfully Upgraded   : {success_count} ({summary_data['success_rate']}%)")
    print(f"  Unresolved / Partial    : {fail_count}")
    print(f"  Summary Report          : {out_rep_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
