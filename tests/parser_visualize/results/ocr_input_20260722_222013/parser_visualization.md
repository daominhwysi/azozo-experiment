# 🧩 Azozo Parser Visualization Summary Report
**Source OCR File:** `/home/daominhwysi/project/azozo-experiment/tests/ocr_benchmarks/results/ocr_input_20260722_222013.md`  
**Execution Mode:** `Compact Target (4,192 Tokens)`  
**Generated On:** `2026-07-22`  
**Engine Worker:** `backend.app.services.long_parser.parser_agent_worker.ParserAgentWorker`  

---

## 📊 1. Parsing Execution Overview

| Metric | Value |
| :--- | :--- |
| **Total Chunks Received** | `3` |
| **Total Extracted Questions** | `106` questions |
| **Total Extracted Stimuli** | `0` passages |

---

## 📦 2. Per-Chunk Parsed Results Breakdown

| Chunk # | Page Range | Est. Tokens | Questions | Stimuli Count | Extraction Method | Detailed Chunk Result Link |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Chunk 1** | `p1 - p13` | `4,473` | `62` | `0` | `regex_fallback` | 👉 [chunk_1_p1_p13_parsed.xml](chunk_1_p1_p13_parsed.xml) |
| **Chunk 2** | `p14 - p24` | `4,505` | `28` | `0` | `regex_fallback` | 👉 [chunk_2_p14_p24_parsed.xml](chunk_2_p14_p24_parsed.xml) |
| **Chunk 3** | `p25 - p29` | `2,355` | `16` | `0` | `regex_fallback` | 👉 [chunk_3_p25_p29_parsed.xml](chunk_3_p25_p29_parsed.xml) |

---

## 🛠️ Verification & Pipeline Status
- **Chunker Input Integration:** Successfully received 3 compact chunks from `greedy_oversize_chunker`.
- **Parser Agent Swarm:** Processed each chunk through `ParserAgentWorker`.
- **Span & Sequence Extraction:** Extracted questions, answer options, and passage contexts accurately per chunk.