import json
import re
from pathlib import Path
import fitz

def main():
    raw_dir = Path("data/sequence_labelling_input_data_raw")
    out_dir = Path("data/sequence_labelling_input_data")

    raw_pdfs = sorted(list(raw_dir.rglob("*.pdf")))
    out_mds = sorted(list(out_dir.rglob("*.md")))

    categories = {}
    status_counts = {
        "total_raw_pdfs": len(raw_pdfs),
        "total_output_mds": len(out_mds),
        "md_exists": 0,
        "md_missing": 0,
        "empty_or_tiny": 0,
        "has_error_text": 0,
        "page_count_match": 0,
        "page_count_mismatch": 0,
        "no_page_tags": 0,
        "fully_valid_ocr": 0,
    }

    issues = []

    for pdf_path in raw_pdfs:
        rel_path = pdf_path.relative_to(raw_dir)
        md_path = out_dir / rel_path.with_suffix(".md")
        cat = rel_path.parts[0] if len(rel_path.parts) > 1 else "root"
        subj = rel_path.parts[1] if len(rel_path.parts) > 2 else "none"
        cat_key = f"{cat}/{subj}"
        
        if cat_key not in categories:
            categories[cat_key] = {"total": 0, "success": 0, "failed": 0, "missing": 0}
        categories[cat_key]["total"] += 1
        
        try:
            doc = fitz.open(pdf_path)
            pdf_pages = len(doc)
            doc.close()
        except Exception as e:
            pdf_pages = -1

        if not md_path.exists():
            status_counts["md_missing"] += 1
            categories[cat_key]["missing"] += 1
            issues.append({"file": str(rel_path), "issue": "Missing .md file"})
            continue

        status_counts["md_exists"] += 1
        content = md_path.read_text(encoding="utf-8", errors="ignore")
        
        if len(content.strip()) < 50:
            status_counts["empty_or_tiny"] += 1
            categories[cat_key]["failed"] += 1
            issues.append({"file": str(rel_path), "issue": f"Empty or tiny ({len(content)} bytes)"})
            continue
            
        if "Error:" in content[:100] or "Traceback (most recent call last)" in content:
            status_counts["has_error_text"] += 1
            categories[cat_key]["failed"] += 1
            issues.append({"file": str(rel_path), "issue": "Contains error message"})
            continue

        page_tags = re.findall(r"<page\b[^>]*>", content)
        meta_tags = re.findall(r"<page_metadata>", content)
        md_pages = len(page_tags) if len(page_tags) > 0 else len(meta_tags)
        
        if md_pages == 0:
            status_counts["no_page_tags"] += 1
        elif pdf_pages > 0:
            if md_pages == pdf_pages:
                status_counts["page_count_match"] += 1
            else:
                status_counts["page_count_mismatch"] += 1
                issues.append({"file": str(rel_path), "issue": f"Page mismatch: PDF={pdf_pages}, MD={md_pages}"})

        status_counts["fully_valid_ocr"] += 1
        categories[cat_key]["success"] += 1

    print("\n=== SUMMARY OF OCR STATUS ===")
    print(json.dumps(status_counts, indent=2))

    print("\n=== BREAKDOWN BY CATEGORY/SUBJECT ===")
    for k, v in sorted(categories.items()):
        t = v["total"]
        s = v["success"]
        m = v["missing"]
        f = v["failed"]
        print(f"{k:35}: Total {t:3d} | Success: {s:3d} | Missing: {m:3d} | Failed: {f:3d}")

    if issues:
        print(f"\n=== ISSUES / ANOMALIES FOUND ({len(issues)}) ===")
        for issue in issues[:50]:
            print(f" - {issue['file']}: {issue['issue']}")
        if len(issues) > 50:
            print(f" ... and {len(issues) - 50} more.")

if __name__ == "__main__":
    main()
