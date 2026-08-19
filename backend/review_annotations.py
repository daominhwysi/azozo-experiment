#!/usr/bin/env python3
"""
CLI Tool for Reviewing XML Sequence Labelling Quality and Discarding Malfunctioned Documents.
Powered by Deterministic Static Checks & DeepSeek Multi-Provider Client.
"""

import sys
import json
import argparse
from pathlib import Path

# Add workspace directory to path
script_dir = Path(__file__).resolve().parent
workspace_dir = script_dir.parent
sys.path.insert(0, str(workspace_dir))

from backend.app.domains.ocr.annotator.reviewer import (
    AnnotationReviewerAgent,
    ReviewDecision,
    BatchReviewSummary,
)
from backend.app.core.config import REVIEWER_MODEL, REVIEWER_PROVIDER, REVIEWER_MIN_SCORE


def parse_args():
    parser = argparse.ArgumentParser(
        description="Azozo Sequence Labelling Quality Reviewer & Malfunction Discarder"
    )
    parser.add_argument(
        "--input",
        "-i",
        type=str,
        default="data/sequence_labelling_annotated",
        help="Path to directory containing annotated XML files or a single XML file (default: data/sequence_labelling_annotated)",
    )
    parser.add_argument(
        "--raw-dir",
        "-r",
        type=str,
        default="data/sequence_labelling_input_data",
        help="Path to directory containing raw OCR markdown files (default: data/sequence_labelling_input_data)",
    )
    parser.add_argument(
        "--discard-dir",
        "-d",
        type=str,
        default="data/sequence_labelling_discarded",
        help="Destination directory for quarantined / discarded malfunctioned documents (default: data/sequence_labelling_discarded)",
    )
    parser.add_argument(
        "--auto-discard",
        action="store_true",
        help="Automatically move / quarantine documents that receive a DISCARD decision",
    )
    parser.add_argument(
        "--min-score",
        type=int,
        default=REVIEWER_MIN_SCORE,
        help=f"Minimum score threshold (0-100) for passing (default: {REVIEWER_MIN_SCORE})",
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Disable DeepSeek LLM semantic review and rely solely on deterministic static checks",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=REVIEWER_MODEL,
        help=f"LLM model name for semantic review (default: {REVIEWER_MODEL})",
    )
    parser.add_argument(
        "--provider",
        type=str,
        default=REVIEWER_PROVIDER,
        help=f"LLM provider (default: {REVIEWER_PROVIDER})",
    )
    parser.add_argument(
        "--concurrency",
        "-c",
        type=int,
        default=4,
        help="Concurrency for parallel batch review (default: 4)",
    )
    parser.add_argument(
        "--report",
        "-o",
        type=str,
        default="backend/logs/review_report.md",
        help="Output filepath for markdown audit report (default: backend/logs/review_report.md)",
    )
    parser.add_argument(
        "--no-save-audit",
        action="store_true",
        help="Do not save audit_report.json inside individual document folders",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate review and show discard actions without moving any files",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    input_path = Path(args.input)
    use_llm = not args.no_llm

    if not input_path.exists():
        print(f"❌ Error: Input path '{args.input}' does not exist.")
        sys.exit(1)

    print("=" * 70)
    print("🔍 AZOZO ANNOTATION QUALITY REVIEWER & DISCARD AGENT")
    print("=" * 70)
    print(f"  Input Target   : {args.input}")
    print(f"  Raw Source Dir : {args.raw_dir}")
    print(f"  Discard Target : {args.discard_dir}")
    print(f"  Auto-Discard   : {'ENABLED' if args.auto_discard else 'DISABLED (Report Only)'}")
    print(f"  Save Audit JSON: {'DISABLED' if args.no_save_audit else 'ENABLED (audit_report.json)'}")
    print(f"  Min Score      : {args.min_score} / 100")
    print(f"  LLM Semantic   : {'ENABLED (' + args.model + ' via ' + args.provider + ')' if use_llm else 'DISABLED'}")
    print(f"  Concurrency    : {args.concurrency}")
    print("=" * 70)

    agent = AnnotationReviewerAgent(
        model=args.model,
        provider=args.provider,
        min_score=args.min_score,
    )

    if input_path.is_file():
        # Review single document
        print(f"\nEvaluating single document: {input_path}...")
        report = agent.review_file(
            input_path,
            use_llm=use_llm,
            save_audit_json=not args.no_save_audit,
        )

        llm_str = f"{report.llm_score:.1f}" if report.llm_score is not None else "N/A"
        print("\n" + "-" * 50)
        print(f"📄 Document ID : {report.doc_id}")
        print(f"🎯 Score       : {report.overall_score:.1f} / 100 ({report.grade}) [Det: {report.deterministic_score:.1f} | LLM: {llm_str}]")
        print(f"⚖️ Decision    : {report.decision.value}")
        print(f"❓ Questions   : {report.metrics.get('questions_count', 0)}")
        print(f"📑 Options     : {report.metrics.get('option_labels_count', 0)}")
        print(f"🔗 Stimuli     : {report.metrics.get('stimuli_count', 0)}")
        print(f"📝 Verbatim Ret: {report.metrics.get('retention_ratio', 'N/A')}")
        if report.parser_info:
            print(f"⚙️ Parser Info : {report.parser_info}")
        print("-" * 50)

        if report.issues:
            print("\n⚠️ Issues Detected:")
            for iss in report.issues:
                print(f"  - [{iss.severity.value}] [{iss.category}] {iss.message}")

        if report.decision == ReviewDecision.DISCARD:
            print("\n❌ MALFUNCTION DETECTED:")
            for r in report.discard_reasons:
                print(f"  • {r}")

            if args.auto_discard:
                print(f"\n📦 Quarantining document to {args.discard_dir}...")
                discard_res = agent.discard_document(
                    xml_path=input_path,
                    report=report,
                    discard_dir=args.discard_dir,
                    dry_run=args.dry_run,
                )
                print(f"  Status: {'Simulated (Dry Run)' if args.dry_run else 'Moved'}")
                print(f"  Dest  : {discard_res.get('destination_path')}")

        sys.exit(0 if report.decision != ReviewDecision.DISCARD else 2)

    else:
        # Batch review
        print(f"\nStarting batch review on directory: {input_path}...")

        def progress_cb(current, total, rep):
            symbol = "🟢" if rep.decision == ReviewDecision.PASS else ("🟡" if rep.decision == ReviewDecision.NEEDS_REVISION else "🔴")
            llm_display = f"LLM:{rep.llm_score:>4.1f}" if rep.llm_score is not None else "LLM: N/A"
            print(f"  [{current}/{total}] {symbol} {rep.doc_id:<28} Score: {rep.overall_score:>5.1f} [{rep.grade}] (Det:{rep.deterministic_score:>4.1f} | {llm_display}) -> {rep.decision.value}")

        summary = agent.batch_review(
            annotated_dir=input_path,
            raw_dir=args.raw_dir if Path(args.raw_dir).exists() else None,
            discard_dir=args.discard_dir if args.auto_discard else None,
            auto_discard=args.auto_discard and not args.dry_run,
            save_audit_json=not args.no_save_audit,
            use_llm=use_llm,
            concurrency=args.concurrency,
            output_report_path=args.report,
            progress_callback=progress_cb,
        )

        print("\n" + "=" * 70)
        print("📊 BATCH AUDIT EXECUTION SUMMARY")
        print("=" * 70)
        print(f"  Total Reviewed : {summary.total_documents}")
        print(f"  Average Score  : {summary.average_score:.1f} / 100")
        print(f"  Passed         : {summary.passed_count} ({summary.passed_count/max(1, summary.total_documents)*100:.1f}%)")
        print(f"  Needs Revision : {summary.needs_revision_count} ({summary.needs_revision_count/max(1, summary.total_documents)*100:.1f}%)")
        print(f"  Discarded      : {summary.discarded_count} ({summary.discarded_count/max(1, summary.total_documents)*100:.1f}%)")
        print(f"  Duration       : {summary.duration_sec:.1f}s")
        print("=" * 70)

        if summary.failure_reasons_distribution:
            print("\n🚨 Malfunction Distribution:")
            for cat, count in sorted(summary.failure_reasons_distribution.items(), key=lambda x: x[1], reverse=True):
                print(f"  - {cat:<20}: {count} file(s)")

        if args.report:
            report_p = Path(args.report)
            agent.export_markdown_report(summary, report_p)
            print(f"\n📄 Full audit report saved to: {report_p.resolve()}")

            json_report_p = report_p.with_suffix(".json")
            with open(json_report_p, "w", encoding="utf-8") as f:
                json.dump(summary.model_dump(), f, indent=2, ensure_ascii=False)
            print(f"💾 JSON report saved to: {json_report_p.resolve()}")


if __name__ == "__main__":
    main()
