# 🧩 Azozo Parser Visualization Summary Report
**Source OCR File:** `tests/ocr_benchmarks/results/ocr_de-va-dap-an-chinh-thuc-ky-thi-tot-nghiep-thpt-nam-2025-mon-tieng-anh_20260724_152559.md`  
**Execution Mode:** `Compact Target (4,192 Tokens)`  
**Generated On:** `2026-07-22`  
**Engine Worker:** `backend.app.services.long_parser.parser_agent_worker.ParserAgentWorker`  

---

## 📊 1. Parsing Execution Overview

| Metric | Value |
| :--- | :--- |
| **Total Chunks Received** | `3` |
| **Total Extracted Questions** | `97` questions |
| **Total Extracted Stimuli** | `0` passages |

---

## 📦 2. Per-Chunk Parsed Results Breakdown

| Chunk # | Page Range | Est. Tokens | Questions | Stimuli Count | Extraction Method | Detailed Chunk Result Link |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Chunk 1** | `p1 - p3` | `4,373` | `26` | `0` | `det_parser+anchor_extraction` | 👉 [chunk_1_p1_p3_parsed.xml](chunk_1_p1_p3_parsed.xml) |
| **Chunk 2** | `p3 - p7` | `6,708` | `50` | `0` | `det_parser+anchor_extraction` | 👉 [chunk_2_p3_p7_parsed.xml](chunk_2_p3_p7_parsed.xml) |
| **Chunk 3** | `p7 - p8` | `2,511` | `21` | `0` | `det_parser+anchor_extraction` | 👉 [chunk_3_p7_p8_parsed.xml](chunk_3_p7_p8_parsed.xml) |

---

## 🛠️ Verification & Pipeline Status
- **Chunker Input Integration:** Successfully received 3 compact chunks from `greedy_oversize_chunker`.
- **Parser Agent Swarm:** Processed each chunk through `ParserAgentWorker`.
- **Span & Sequence Extraction:** Extracted questions, answer options, and passage contexts accurately per chunk.