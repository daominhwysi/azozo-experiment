---
name: doc-reviewer
description: Evaluates and rates the sequence-labelling quality of annotated exam documents (XML ground-truth) using deterministic static audits and DeepSeek LLM semantic review, automatically quarantining and discarding malfunctioned documents. Activate when the user asks to review annotations, rate annotation quality, audit XML sequence datasets, or discard corrupted exam documents.
---

# Document Annotation Reviewer Agent (Quality Rater & Malfunction Discarder)

This skill guides the AI agent to audit, rate, and filter sequence-labelled exam XML documents (`merged.xml`, `.xml`) against strict ground-truth annotation standards, automatically detecting malfunctions and managing quarantine/discard workflows.

---

## 🎯 Architecture & Review Principles

The Reviewer Agent operates on a **2-Tier Hybrid Inspection Engine**:

1. **Tier 1: High-Speed Deterministic Auditor (Static & Structural Validation)**
   - **XML Well-Formedness**: Validates tag matching, nesting, premature cutoffs, unclosed tags.
   - **Prohibited Tag Removal**: Enforces strict pruning of `<pages>`, `<page>`, `<page_metadata>`, `<think>`.
   - **Stimulus Nesting Auto-Reject (CRITICAL)**: Automatically rejects any document where `<stimulus>` wraps or encloses other system tags (`<stem>`, `<question_label>`, `<option_label>`, `<option_text>`, `<explanation>`).
   - **Question & Choice Hierarchy**: Verifies all questions have `<question_label>` and non-empty `<stem>`, choice letters are paired with `<option_text>`, and sub-questions (`a)`, `b)`) in essay/true-false are correctly segmented.
   - **Document Scale & Error Rate Proportionality**: Evaluates error frequencies relative to total question count. A 30-question exam with 1 isolated mislabelled stem or minor glitch has >96% accuracy and is scored favorably (e.g. 85–95 / `PASS`), NOT failed.
   - **Table HTML Support**: Validates standard HTML table structures (`<table>`, `<tr>`, `<td>`, `<th>`). In tabular True/False questions, statement cells tagged as `<td><option_text>...</option_text></td>` are recognized as valid structure.
   - **Figure Policy**: Figures (`<figure ... />`) are out of evaluation scope for now and are not penalized.
   - **Sequence Continuity**: Detects repetitive loops, duplicate questions, and large numbering gaps.
   - **Stimulus Verification**: Ensures `<stimulus>` tags have valid `start_anchor` and `end_anchor` resolving to real text and apply to $\ge 2$ questions.
   - **Verbatim Retention & Hallucination Check**: Compares pure text against raw OCR input, checking character/token retention ratio and detecting dropped or hallucinated passages.

2. **Tier 2: DeepSeek Semantic Reviewer (LLM-Powered Pedagogical Audit)**
   - Uses `backend/app/domains/llm/deepseek_client.py` (multi-provider client supporting DeepSeek, Xah, NVIDIA).
   - Ingests both target annotated XML and original raw OCR source text for omission verification.
   - **Acceptable Text Omission Rule**: Verifies if omitted text was merely extraneous non-question lecture notes, theory chapters, or intro blurbs. If all exam questions and choices are intact, lower retention is proven acceptable and scored favorably.
   - Audits math LaTeX expressions, sub-question absorption into stems, multi-question stimulus validity, and subtle educational nuances.
   - Generates rubric scores across 6 core dimensions and structured diagnostic feedback.

3. **Tier 3: Automated Discard & Quarantine Manager**
   - Documents with critical malfunctions (e.g. fatal syntax errors, stimulus nesting system tags, 0 questions, severe hallucinations, unpruned page tags, score below threshold) are tagged with decision `DISCARD`.
   - Automatically moves corrupted document folders into a quarantine directory (e.g. `data/sequence_labelling_discarded/`) along with a full diagnostic `audit_report.json`.

---

## ⚖️ Merged Level vs. Chunk Level Processing Strategy

To ensure comprehensive audit coverage without duplicate processing:
- **Default Policy ($\le 500\text{k}$ tokens)**: Process the **`merged.xml`** full document (representing the complete continuous exam paper from Question 1 to Question $N$).
- **Large Document Fallback ($> 500\text{k}$ tokens)**: If an exam document exceeds 500k input tokens, automatically fallback to reviewing at the **chunk level** (`chunk_0.xml`, `chunk_1.xml`, ...).
- **Core Invariant**: Never process both `merged.xml` and `chunk_*.xml` for the same document.

---

## 🏷️ Severity Classification & Rubric Dimensions

### Issue Severity Definitions:
- **`CRITICAL` (Immediate Auto-Discard)**: Fatal structural failures making the document unusable:
  - Truncated output mid-tag at EOF
  - Zero questions in document
  - Mismatched or unclosed tags
  - Unpruned `<pages>`, `<page>`, or `<page_metadata>`
  - `<stimulus>` illegally wrapping `<stem>`, `<question_label>`, `<option_label>`, `<option_text>`, or `<explanation>`
  - Severe text loss with dropped questions (retention $< 25\%$) or severe hallucination (retention $> 140\%$)
  - Infinite repetition loops ($\ge 4$ consecutive duplicates)
- **`MAJOR` (Systemic Repetition)**: Repetitive errors occurring across a large portion ($\ge 15-20\%$) of the document that could poison model training if retained (e.g., systematic absorption of sub-questions `a)`, `b)` into `<stem>` across multiple questions, dropped exam questions).
- **`MINOR` (Isolated Glitches)**: One-off, low-frequency imperfections (1–2 isolated items in a 20–30+ question exam).
- **`INFO` (Informational)**: Informative observations (omitted non-question lecture notes, mixed solved/unsolved problems, table layout).

### Scoring Schema:
Each document receives an overall score (0–100) and letter grade (`A`: 90–100, `B`: 80–89, `C`: 70–79, `D`: 60–69, `F`: <60):

| Rubric Dimension | Weight | Critical Failure Triggers (Immediate Discard) |
| :--- | :--- | :--- |
| **XML Well-Formedness** | 25% | Unclosed tags, truncated mid-tag at EOF, mismatched closing tags, zero tags found. |
| **Schema Conformance** | 15% | Unpruned `<pages>`, `<page>`, or `<page_metadata>` tags present. |
| **Question/Choice Completeness** | 25% | 0 questions detected, empty stems, orphaned choice labels without text. |
| **Verbatim Fidelity** | 15% | Retention ratio $< 65\%$ (severe text loss) or $> 140\%$ (severe hallucination). |
| **Sequence Continuity** | 10% | Repetitive infinite loops ($\ge 4$ duplicate questions in a row), missing large sections. |
| **Stimulus Accuracy** | 10% | Stimulus wrapping system tags, missing anchors, anchors not found in document text. |

### Decision Thresholds:
- **`PASS`**: Overall Score $\ge 75$, zero critical malfunctions, no systemic major errors.
- **`NEEDS_REVISION`**: Overall Score $60 - 74$, minor repairable warnings.
- **`DISCARD`**: Overall Score $< 60$ OR any critical malfunction flag (e.g. stimulus nesting system tags).

---

## 🔄 Execution Workflows

### Option 1: Using the Python CLI Tool

To audit and optionally discard malfunctioned files across the entire sequence labelling dataset:

```bash
# Preview audit results (Dry Run, without moving files)
uv run python backend/review_annotations.py --input data/sequence_labelling_annotated --raw-dir data/sequence_labelling_input_data --report backend/logs/review_report.md

# Run full batch audit and automatically quarantine discarded documents
uv run python backend/review_annotations.py --input data/sequence_labelling_annotated --raw-dir data/sequence_labelling_input_data --discard-dir data/sequence_labelling_discarded --auto-discard --report backend/logs/review_report.md

# Review a single document
uv run python backend/review_annotations.py --input data/sequence_labelling_annotated/DGNL_HSA/Tieng_Anh/exam_294/merged.xml
```

### Option 2: Programmatic Python API

```python
from backend.app.domains.ocr.annotator.reviewer import AnnotationReviewerAgent

agent = AnnotationReviewerAgent(min_score=75)

# 1. Review a single XML file
report = agent.review_file(
    xml_path="data/sequence_labelling_annotated/DGNL_HSA/Tieng_Anh/exam_294/merged.xml",
    raw_path="data/sequence_labelling_input_data/DGNL_HSA/Tieng_Anh/exam_294.md",
    use_llm=True
)

print(f"Score: {report.overall_score} | Decision: {report.decision.value}")
if report.is_malfunctioned:
    print(f"Discard reasons: {report.discard_reasons}")
    # Quarantine document
    agent.discard_document(
        xml_path="data/sequence_labelling_annotated/DGNL_HSA/Tieng_Anh/exam_294/merged.xml",
        report=report,
        discard_dir="data/sequence_labelling_discarded"
    )

# 2. Batch Review an entire directory
summary = agent.batch_review(
    annotated_dir="data/sequence_labelling_annotated",
    raw_dir="data/sequence_labelling_input_data",
    discard_dir="data/sequence_labelling_discarded",
    auto_discard=True,
    use_llm=True,
    concurrency=4
)
print(f"Passed: {summary.passed_count}, Discarded: {summary.discarded_count}")
```

### Option 3: Direct In-Memory Agent Review

When reviewing single documents directly inside the Antigravity conversation:
1. Read the annotated XML file with `view_file`.
2. Inspect the XML against the 6 Rubric Dimensions above, checking scale, stimulus nesting, and HTML tables.
3. Compute the quality score and diagnose any critical malfunctions.
4. Output the structured audit table and, if malfunctioned, recommend discarding or revising the document.
