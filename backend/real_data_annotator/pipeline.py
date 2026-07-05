import os
import sys
import json
import argparse
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Union

# Import converter and annotator modules
script_dir = Path(__file__).resolve().parent
sys.path.append(str(script_dir))

from backend.real_data_annotator.pdf_converter import PDFOCRConverter
from backend.real_data_annotator.annotate_ocr import OCRAnnotator, export_conll


def process_pdf_exam_to_sequence_labelled_dataset(
    pdf_path: Union[str, Path],
    output_dir: Optional[Union[str, Path]] = None,
    export_conll_file: bool = True,
    ocr_model: str = "mn/Minimax-M3",
    annotator_model: str = "op/deepseek/deepseek-v4-pro",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Complete PDF OCR System & LLM Sequence Labelling Pipeline.
    Given a PDF exam file:
      1. Converts PDF pages into OCR raw text with page markers.
      2. LLM-annotates text with entity tags (question_label, stem, option_label, etc.).
      3. Tokenizes and aligns character spans to token-level BIO sequence labels.
      4. Exports JSON, XML, and CoNLL sequence labelling dataset files.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    output_dir = Path(output_dir) if output_dir else pdf_path.parent / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    rel_sig = pdf_path.stem
    path_hash = hashlib.md5(rel_sig.encode("utf-8")).hexdigest()[:8]

    md_ocr_path = output_dir / f"{pdf_path.stem}_ocr.md"
    json_path = output_dir / f"real_exam_{path_hash}.json"
    xml_path = output_dir / f"real_exam_{path_hash}.xml"
    conll_path = output_dir / f"real_exam_{path_hash}.conll"

    print("==================================================")
    print(f"Starting End-to-End Exam PDF OCR & Sequence Labelling")
    print(f"Input PDF: {pdf_path}")
    print(f"Output Directory: {output_dir}")
    print("==================================================")

    # Step 1: Run PDF OCR Converter
    print("\n--- Step 1/3: PDF OCR Processing ---")
    converter = PDFOCRConverter(model=ocr_model)
    ocr_text = converter.convert_pdf(pdf_path, output_path=md_ocr_path)
    print(f"OCR completed. Text saved to: {md_ocr_path.name}")

    # Step 2: Run LLM Sequence Labeller & Annotator
    print("\n--- Step 2/3: LLM Sequence Labelling & Entity Tagging ---")
    annotator = OCRAnnotator(model=annotator_model, provider=provider)
    result = annotator.annotate_text(ocr_text)

    result["exam_id"] = f"real_{path_hash}"
    result["pdf_file"] = pdf_path.name
    result["created_at"] = datetime.now().isoformat()
    result["is_real"] = True

    # Step 3: Export Datasets
    print("\n--- Step 3/3: Exporting Sequence Labelling Artifacts ---")

    # 1. Export JSON Dataset
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"  [JSON] Saved sequence labelling JSON dataset to: {json_path.name}")

    # 2. Export XML
    with open(xml_path, "w", encoding="utf-8") as f:
        f.write(result["raw_xml"])
    print(f"  [XML] Saved ground-truth XML to: {xml_path.name}")

    # 3. Export CoNLL format if requested
    if export_conll_file:
        conll_text = export_conll(result["tokens"], result["tags"])
        with open(conll_path, "w", encoding="utf-8") as f:
            f.write(conll_text)
        print(f"  [CoNLL] Saved CoNLL dataset file to: {conll_path.name}")

    # 4. Log request to folder
    try:
        from backend.app.services.ocr_logger import log_ocr_annotate_request
        pdf_bytes = pdf_path.read_bytes()
        log_folder = log_ocr_annotate_request(
            file_bytes=pdf_bytes,
            file_name=pdf_path.name,
            ocr_text=ocr_text,
            annotation_res=result,
            duration=0.0,
            status="success",
            ocr_model=ocr_model,
            annotator_model=annotator_model,
            source="pipeline",
        )
        print(f"  [Logger] Logged request to folder: {log_folder.name}")
    except Exception as log_err:
        print(f"  [Logger Warning] Could not save log folder: {log_err}")

    print("\n==================================================")
    print("Pipeline completed successfully!")
    print(f"Total Character Spans : {len(result['spans'])}")
    print(f"Total Tokens          : {len(result['tokens'])}")
    print("==================================================")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="End-to-End PDF OCR & LLM Sequence Labelling System for Exams"
    )
    parser.add_argument(
        "--pdf", "-p", required=True, help="Path to input PDF exam file"
    )
    parser.add_argument(
        "--output", "-o", default=None, help="Directory to save output files"
    )
    parser.add_argument(
        "--no-conll", action="store_true", help="Disable CoNLL file export"
    )
    parser.add_argument(
        "--ocr-model", default="mn/Minimax-M3", help="Vision LLM model identifier for OCR"
    )
    parser.add_argument(
        "--model", default=None, help="LLM model identifier for sequence annotation"
    )
    parser.add_argument(
        "--provider", choices=["deepseek", "nvidia", "vilao"], default=None
    )

    args = parser.parse_args()

    process_pdf_exam_to_sequence_labelled_dataset(
        pdf_path=args.pdf,
        output_dir=args.output,
        export_conll_file=not args.no_conll,
        ocr_model=args.ocr_model,
        annotator_model=args.model,
        provider=args.provider,
    )


if __name__ == "__main__":
    main()
