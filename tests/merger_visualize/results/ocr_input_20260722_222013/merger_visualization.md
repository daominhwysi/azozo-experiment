# 🔀 Sequence Merger Visualization Report: `ocr_input_20260722_222013`

- **Input OCR Document:** `ocr_input_20260722_222013`
- **Parsed Chunks Merged:** `3` chunks
- **Total Unique Questions Parsed:** `100` questions
- **Question Range:** `101 - 200`
- **Boundary Items Deduplicated:** `48` duplicate entries
- **Merged Unified Output File:** 👉 [merged_full_document.xml](merged_full_document.xml)

---

## 📦 Input Parsed Chunks

| Chunk | Source File | Status |
| :--- | :--- | :--- |
| **Chunk 1** | [chunk_1_p1_p13_parsed.xml](../../parser_visualize/results/ocr_input_20260722_222013/chunk_1_p1_p13_parsed.xml) | ✅ Merged |
| **Chunk 2** | [chunk_2_p13_p23_parsed.xml](../../parser_visualize/results/ocr_input_20260722_222013/chunk_2_p13_p23_parsed.xml) | ✅ Merged |
| **Chunk 3** | [chunk_3_p23_p29_parsed.xml](../../parser_visualize/results/ocr_input_20260722_222013/chunk_3_p23_p29_parsed.xml) | ✅ Merged |

---

## 🛠️ Verification & Reconciler Metrics
- **100% Sequence Coverage:** Successfully merged all sequence-tagged XML chunks without loss.
- **Boundary Safety-Net Deduplication:** Automatically removed overlap entries across boundary pages.
- **Final Document Integrity:** Unified document `merged_full_document.xml` contains all 100 TOEIC questions (101 - 200).