import json
import re
from pathlib import Path
import fitz

def analyze():
    raw_dir = Path("data/sequence_labelling_input_data_raw")
    out_dir = Path("data/sequence_labelling_input_data")

    raw_pdfs = sorted(list(raw_dir.rglob("*.pdf")))
    out_mds = sorted(list(out_dir.rglob("*.md")))

    print(f"=== GENERAL STATS ===")
    print(f"Total raw PDF documents: {len(raw_pdfs)}")
    print(f"Total output MD files  : {len(out_mds)}")

    missing_files = []
    perfect_matches = []
    mismatched_files = []
    malformed_metadata = []
    empty_files = []
    
    category_summary = {}

    for pdf_path in raw_pdfs:
        rel_path = pdf_path.relative_to(raw_dir)
        md_path = out_dir / rel_path.with_suffix(".md")
        cat = rel_path.parts[0] if len(rel_path.parts) > 1 else "root"
        subj = rel_path.parts[1] if len(rel_path.parts) > 2 else "none"
        cat_key = f"{cat}/{subj}"

        if cat_key not in category_summary:
            category_summary[cat_key] = {
                "total_pdfs": 0,
                "md_present": 0,
                "md_missing": 0,
                "exact_page_match": 0,
                "page_mismatch": 0,
            }
        category_summary[cat_key]["total_pdfs"] += 1

        try:
            doc = fitz.open(pdf_path)
            pdf_pages = len(doc)
            doc.close()
        except Exception as e:
            pdf_pages = -1

        if not md_path.exists():
            missing_files.append({"rel_path": str(rel_path), "pdf_pages": pdf_pages})
            category_summary[cat_key]["md_missing"] += 1
            continue

        category_summary[cat_key]["md_present"] += 1
        content = md_path.read_text(encoding="utf-8", errors="ignore")

        if len(content.strip()) == 0:
            empty_files.append(str(rel_path))
            continue

        page_blocks = re.findall(r"<page\b[^>]*>(.*?)</page>", content, flags=re.DOTALL)
        meta_blocks = re.findall(r"<page_metadata>\s*(.*?)\s*</page_metadata>", content, flags=re.DOTALL)

        # Check metadata json validity
        invalid_meta_count = 0
        for mb in meta_blocks:
            try:
                json.loads(mb)
            except Exception:
                invalid_meta_count += 1
        if invalid_meta_count > 0:
            malformed_metadata.append({"rel_path": str(rel_path), "invalid_metas": invalid_meta_count, "total_metas": len(meta_blocks)})

        md_page_count = len(page_blocks) if page_blocks else len(meta_blocks)

        if md_page_count == pdf_pages:
            perfect_matches.append({
                "rel_path": str(rel_path),
                "pages": pdf_pages,
                "size_bytes": len(content.encode("utf-8")),
            })
            category_summary[cat_key]["exact_page_match"] += 1
        else:
            mismatched_files.append({
                "rel_path": str(rel_path),
                "pdf_pages": pdf_pages,
                "md_pages": md_page_count,
                "page_blocks": len(page_blocks),
                "meta_blocks": len(meta_blocks),
                "size_bytes": len(content.encode("utf-8")),
            })
            category_summary[cat_key]["page_mismatch"] += 1

    print(f"\n1. Completely Missing Documents (No MD file generated): {len(missing_files)}")
    for mf in missing_files:
        print(f"   - {mf['rel_path']} ({mf['pdf_pages']} pages in PDF)")

    print(f"\n2. Empty MD Files: {len(empty_files)}")

    print(f"\n3. Exact Page-for-Page Complete OCR Matches: {len(perfect_matches)} / {len(raw_pdfs)} ({len(perfect_matches)/len(raw_pdfs)*100:.1f}%)")

    print(f"\n4. Page Count Mismatches: {len(mismatched_files)}")
    
    # Analyze why page count mismatched
    fewer_pages = [m for m in mismatched_files if m['md_pages'] < m['pdf_pages']]
    more_pages = [m for m in mismatched_files if m['md_pages'] > m['pdf_pages']]
    
    print(f"   - MD has fewer pages than PDF: {len(fewer_pages)}")
    print(f"   - MD has more pages than PDF : {len(more_pages)}")

    print("\n   Sample of Mismatched Files (PDF vs MD pages):")
    for m in mismatched_files[:20]:
        print(f"   - {m['rel_path']}: PDF={m['pdf_pages']} pages -> MD={m['md_pages']} pages (size: {m['size_bytes']} B)")

    print(f"\n5. Files with Malformed/Unparseable JSON in <page_metadata>: {len(malformed_metadata)}")
    for mm in malformed_metadata[:10]:
        print(f"   - {mm['rel_path']}: {mm['invalid_metas']}/{mm['total_metas']} malformed")

    print("\n=== BREAKDOWN BY CATEGORY & SUBJECT ===")
    print(f"{'Category/Subject':<35} | {'Total':<6} | {'MD Exist':<8} | {'Exact Match':<11} | {'Mismatch':<8} | {'Missing':<7}")
    print("-" * 85)
    for cat, stats in sorted(category_summary.items()):
        print(f"{cat:<35} | {stats['total_pdfs']:<6} | {stats['md_present']:<8} | {stats['exact_page_match']:<11} | {stats['page_mismatch']:<8} | {stats['md_missing']:<7}")

if __name__ == "__main__":
    analyze()
