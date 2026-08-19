# Azozo Exam Platform

> **Azota-Grade PDF OCR, Sequence Labeling & Online Examination System**  
> Built with high-precision PyMuPDF text rasterization, INT8 RF-DETR figure detection, verbatim sequence-labeling LLMs, and a distraction-free Notion-inspired UI design system.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites & Environment Setup](#prerequisites--environment-setup)
- [Configuration (`backend/config.yaml`)](#configuration-backendconfigyaml)
- [Quickstart Guide](#quickstart-guide)
  - [1. Backend Setup & Run](#1-backend-setup--run)
  - [2. Frontend Setup & Run](#2-frontend-setup--run)
- [OCR & Sequence Labeling Engine](#ocr--sequence-labeling-engine)
  - [Figure Detection (ONNX INT8 RF-DETR)](#figure-detection-onnx-int8-rf-detr)
  - [Sequence Labeling XML Tag Specification](#sequence-labeling-xml-tag-specification)
  - [Long-Context Parser Pipeline](#long-context-parser-pipeline)
- [API Reference](#api-reference)
- [CLI Tools & Scripts](#cli-tools--scripts)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Design System & Visual Principles](#design-system--visual-principles)
- [License](#license)

---

## Overview

**Azozo** is a modern, full-stack online examination and OCR sequence-labeling system. It bridges the gap between raw exam documents (PDF/DOCX) and structured interactive assessments.

### Target Personas
- **Teachers & Examiners**: Rapidly ingest PDF exam papers, automatically extract questions, options, explanations, and figures with bounding boxes, align answer keys, and manage test rooms.
- **Students**: Take practice tests and exams in a quiet, distraction-free environment adhering to Notion-style minimalist ergonomics.
- **ML & Data Engineers**: Curate high-fidelity sequence-labeled dataset samples (XML/CoNLL) for training downstream question-answering and layout-parsing models.

---

## Key Features

- **High-Throughput Vision OCR**:
  - High-resolution page rasterization and token alignment using PyMuPDF (`fitz`).
  - Concurrent chunk processing with real-time SSE progress streaming.
- **Edge-Optimized Figure Detection (INT8 ONNX)**:
  - RF-DETR object detection quantized to dynamic per-channel INT8 (`export_onnx/iter1-haswell-int8.onnx`).
  - Operates efficiently on low-power x86 CPUs (~1.19s/page on dual-core Haswell) with zero GPU requirement.
  - Generates continuous figure IDs (`fig_1`, `fig_2`, ...) and projects bounding box coordinates (`bbox="x1,y1,x2,y2"`) back onto rendered exam pages.
- **Verbatim XML Sequence Labeling**:
  - Strict preservation of source text and character offsets (zero paraphrasing or hallucination).
  - Rich tag hierarchy: `<section>`, `<stimulus>`, `<stem>`, `<option id="...">`, `<explanation>`, and `<figure>`.
  - Fallback deterministic rule engine for high-speed parsing.
- **Long-Context Passage-Locked Chunker & Merger**:
  - Chunks multi-page exams while preserving stimulus/passage integrity.
  - Graph entity resolver (`linking_agent.py`) and robust sequence reconciler (`source_merger/`) for seamless boundary stitching.
- **Notion-Inspired Examination Experience**:
  - Distraction-free single/all-question exam taker with timer countdown and question grid navigation.
  - Automatic scoring and comprehensive post-submission assessment reviews.
  - Interactive PDF annotation workspace (`PdfAnnotator.tsx`) with Monaco XML editor and live bounding-box visualization.
  - Unstructured answer-key auto-aligner powered by LLM.

---

## System Architecture

```
                                  ┌───────────────────────────────┐
                                  │   Raw Exam PDF / Text Input   │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │           PyMuPDF Rasterizer & Tokenizer        │
                         └────────┬───────────────────────────────┬────────┘
                                  │                               │
       ┌──────────────────────────┴───────────────┐               │
       │   RF-DETR INT8 Figure Detector (ONNX)    │               │
       │   - Detects illustrations & diagrams     │               │
       │   - Generates badges & bounding boxes    │               │
       └──────────────────────────┬───────────────┘               │
                                  │                               │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │   Multimodal LLM / Deterministic Parser Worker  │
                         │   - Sequence Labeling (<stem>, <option>, etc.)  │
                         │   - Verbatim XML Structure Alignment            │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │   Long-Context Chunker & Source Merger Engine   │
                         │   - Passage-Locked Greedy Chunker               │
                         │   - Graph Linker & Sequence Reconciler          │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │            FastAPI Domain Services              │
                         │   /api/exams  |  /api/parse-exam  |  /api/tasks │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │      React 19 + TypeScript + Tailwind v4 UI     │
                         │   (PdfAnnotator, ExamBank, ExamStudentRoom)     │
                         └─────────────────────────────────────────────────┘
```

---

## Repository Structure

```
azozo/
├── .agents/                      # AI coding agent skills & prompts
│   └── skills/
│       ├── create-agentsmd/      # AGENTS.md generator skill
│       ├── doc-annotator/        # Verbatim single-agent sequence labeling skill
│       ├── hallmark/             # Anti-AI-slop design system skill
│       ├── notion-ui-skills/     # Notion design guideline skill
│       └── subagent-parser/      # Multi-agent parallel parsing orchestrator
├── backend/                      # FastAPI Application & Data Layer
│   ├── app/                      # Application package
│   │   ├── core/                 # Config loader (config.py) & JSON persistence (database.py)
│   │   ├── domains/              # Modular domain logic
│   │   │   ├── exams/            # Exam CRUD, submissions & answer key mapper
│   │   │   ├── llm/              # Multi-provider client (XAH, CommandCode, DeepSeek, NIM, Vilao)
│   │   │   └── ocr/              # OCR annotator, figure detector & parser engines
│   │   │       ├── annotator/    # PDF converter, RF-DETR detector, XML system prompts
│   │   │       └── parser/       # Deterministic & Long-Context Chunker/Merger parsers
│   │   └── main.py               # FastAPI entrypoint & router aggregation
│   ├── app.py                    # Uvicorn server launcher
│   ├── config.yaml               # Model, provider, chunker & detector configuration
│   └── db.json                   # JSON database store
├── export_onnx/                  # Quantized ONNX detection models
│   ├── iter1-haswell-int8.onnx   # Production INT8 RF-DETR figure detector (45MB)
│   ├── rfdetr-small-int8.onnx    # Small quantized detector
│   └── rfdetr-small.onnx         # Full precision reference model
├── scripts/                      # Operational & data curation scripts
│   ├── annotate_sequence_labelling_dataset.py # Batch sequence labeling script
│   ├── batch_ocr_raw_dataset.py  # Batch PDF OCR runner with 3-level progress bars
│   ├── eval_new_deterministic_parser.py # Parser accuracy evaluation benchmark
│   └── generate_html_report.py   # Visual comparison HTML report generator
├── tools/                        # Diagnostic and model optimization tools
│   ├── check_ocr_status.py       # Batch OCR progress monitor
│   ├── detailed_ocr_audit.py     # OCR accuracy and tag audit utility
│   └── model_optimization/       # INT8 dynamic quantization & CPU benchmarks
├── tests/                        # Automated test suites
│   └── unit/                     # Pytest unit tests (figure detector, parser, merger)
├── vite-app/                     # React 19 + TypeScript + Vite Frontend
│   ├── src/
│   │   ├── components/ui/        # Shared UI components (Button, Card, Dialog, etc.)
│   │   ├── features/
│   │   │   ├── exam/             # Exam taker, Student Room, Gradebook, Exam Editor
│   │   │   └── ocr/              # PDF Annotator workspace & question preview cards
│   │   ├── layouts/              # Header and navigation sidebar layouts
│   │   └── services/api.ts       # Typed API client for FastAPI backend
│   └── package.json
├── AGENTS.md                     # Technical context & instructions for AI coding agents
├── DESIGN.md                     # Visual design specification & Notion guidelines
├── PRODUCT.md                    # Product foundation, user personas & positioning
├── pytest.ini                    # Pytest configuration
└── requirements.txt              # Python dependencies for uv
```

---

## Prerequisites & Environment Setup

### System Requirements
- **Python**: `>= 3.10` (recommended: Python 3.11 or 3.12)
- **Node.js**: `>= 18` and `npm`
- **Package Manager**: [uv](https://docs.astral.sh/uv/) for Python workflows

### Environment Secrets (`.env`)
Create a `.env` file in the root directory:

```env
# Multi-Provider LLM Keys (configure based on backend/config.yaml providers)
LLM_API_KEY=your_vilao_or_xah_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
NVIDIA_API_KEY=your_nvidia_api_key
XAH_API_KEY=your_xah_api_key
CMD_API_KEY=your_commandcode_api_key
```

---

## Configuration (`backend/config.yaml`)

Azozo centralizes all model routing, hardware optimizations, and token budgets in `backend/config.yaml`:

```yaml
providers:
  xah:
    base_url: "https://api.xah.io/v1"
    api_key_env: "XAH_API_KEY"
  commandcode:
    base_url: "http://127.0.0.1:3050/v1"
    api_key_env: "CMD_API_KEY"
  deepseek:
    base_url: "https://api.deepseek.com/v1"
    api_key_env: "DEEPSEEK_API_KEY"
  nvidia:
    base_url: "https://integrate.api.nvidia.com/v1"
    api_key_env: "NVIDIA_API_KEY"
  vilao:
    base_url: "https://api.vilao.ai/v1"
    api_key_env: "LLM_API_KEY"

models:
  ocr:
    model_name: "gpt-5.6-luna"
    provider: "commandcode"
    batch_size: 10
    thinking: medium
    concurrency: 1
    figure_detection:
      enabled: true
      model_path: "export_onnx/iter1-haswell-int8.onnx"
      confidence_threshold: 0.3
      class_names: ["bangbienthien", "class_1"]
      included_class_ids: [1]

  parser:
    model_name: "phatchau036/gpt-5.6-luna"
    provider: "xah"
    thinking: high
    max_tokens: 128000

  linker:
    model_name: "levuphong2909/gpt-5.6-luna"
    provider: "xah"
    thinking: low

  answer_mapper:
    model_name: "phatchau036/minimax-m3"
    provider: "xah"

  chunker:
    target_tokens: 30000
    max_tokens: 45000
    overlap_pages: 1

logging:
  dir: "logs/ocr_logs"
  enabled: true

server:
  host: "0.0.0.0"
  port: 8000
```

---

## Quickstart Guide

### 1. Backend Setup & Run

```bash
# 1. Create and activate uv virtual environment
uv venv .venv
source .venv/bin/activate

# 2. Install dependencies
uv pip install -r requirements.txt

# 3. Launch FastAPI server
uv run python backend/app.py
```

- **API Base URL**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/api/health`

### 2. Frontend Setup & Run

```bash
# 1. Navigate to frontend directory
cd vite-app

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

- **Frontend URL**: `http://localhost:5173`

---

## OCR & Sequence Labeling Engine

### Figure Detection (ONNX INT8 RF-DETR)
During PDF conversion, `backend/app/domains/ocr/annotator/figure_detector.py` scans rendered page images using the optimized INT8 ONNX model:
1. Detects illustrations, geometry drawings, and physics diagrams (class `1`).
2. Table graphs (class `0` - `bangbienthien`) are preserved for native markdown tabular parsing.
3. Stamps a labeled badge onto the visual image and emits inline tags:
   ```xml
   <figure id="fig_1" description="Đồ thị hàm số y = f'(x) trên mặt phẳng tọa độ Oxy." bbox="120,450,540,820" />
   ```

### Sequence Labeling XML Tag Specification
The annotator engine outputs strictly structured XML preserving 100% verbatim source characters:

```xml
<section title="PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.">
Thí sinh trả lời từ câu 1 đến câu 12. Mỗi câu hỏi chỉ chọn một phương án.

<stimulus id="stim_1">
Đọc đoạn tư liệu sau đây và trả lời các câu hỏi từ 1 đến 2:
"Văn kiện Đại hội đại biểu toàn quốc lần thứ XIII nhấn mạnh phát triển kinh tế số..."
</stimulus>

<stem>
Câu 1. Theo đoạn tư liệu trên, yếu tố trọng tâm trong phát triển kinh tế số là gì?
</stem>
<option id="A">Phát triển hạ tầng viễn thông và dữ liệu số.</option>
<option id="B">Tập trung khai thác tài nguyên truyền thống.</option>
<option id="C">Giảm thiểu ứng dụng tự động hóa trong quản lý.</option>
<option id="D">Hạn chế đầu tư khoa học công nghệ cao.</option>
<explanation>
Lời giải: Văn kiện Đại hội XIII xác định phát triển hạ tầng số là nền tảng cốt lõi. Chọn A.
</explanation>
</section>
```

### Long-Context Parser Pipeline
For large multi-page exam papers (20-100+ pages), the `LongContextParserPipeline` orchestrates:
1. **Passage-Locked Chunker**: Splits document while preserving `<stimulus>` and `<section>` semantic contexts within configured token limits (`30k`-`45k` tokens).
2. **Parallel Sequence Labeling Swarm**: Executes LLM workers across sliding windows with boundary overlaps.
3. **Source Merger & Reconciler**: Projects labeled spans back to canonical source offsets, resolves boundary discrepancies, and validates XML schema integrity.

---

## API Reference

### Exam Management Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/exams` | List all saved exams in the database. |
| `GET` | `/api/exams/{id}` | Get full exam details, questions, and options. |
| `POST` | `/api/exams` | Create a new exam paper. |
| `PUT` | `/api/exams/{id}` | Update exam metadata and questions. |
| `DELETE` | `/api/exams/{id}` | Delete exam and associated submissions. |
| `POST` | `/api/exams/{id}/submit` | Submit student responses and receive instant grading. |
| `GET` | `/api/exams/submissions` | List all student submissions (filterable by `exam_id`). |
| `DELETE` | `/api/exams/submissions/{id}` | Delete a student submission record. |
| `POST` | `/api/exams/{id}/import-answers` | Align unstructured answer key text/PDF to questions via LLM. |

### OCR & Parsing Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/parse-exam` | Upload PDF or raw text to run synchronous OCR + sequence labeling. |
| `POST` | `/api/parse-exam-stream` | SSE streaming endpoint broadcasting OCR and LLM token progress. |
| `POST` | `/api/parse-exam/long-context` | Multi-pass long-context chunker & sequence reconciler for large PDFs. |
| `POST` | `/api/ocr-tasks` | Enqueue background async OCR job with optional auto-save to Exam Bank. |
| `GET` | `/api/ocr-tasks` | List all active/completed background OCR jobs. |
| `GET` | `/api/ocr-tasks/{id}` | Get status, live progress, and result payload of an OCR job. |
| `DELETE` | `/api/ocr-tasks/{id}` | Cancel/delete an OCR task. |
| `GET` | `/api/health` | Health check endpoint. |

---

## CLI Tools & Scripts

The repository includes a suite of operational scripts under `scripts/` and `tools/`:

- **Batch OCR Ingestion**:
  ```bash
  uv run python scripts/batch_ocr_raw_dataset.py \
    --input-dir data/sequence_labelling_input_data_raw \
    --output-dir data/sequence_labelling_ocr_transcripts
  ```
- **Batch Dataset Sequence Annotation**:
  ```bash
  uv run python scripts/annotate_sequence_labelling_dataset.py \
    --input-dir data/sequence_labelling_ocr_transcripts \
    --output-dir data/sequence_labelling_annotated
  ```
- **Evaluate Deterministic Parser Accuracy**:
  ```bash
  uv run python scripts/eval_new_deterministic_parser.py
  ```
- **RF-DETR INT8 Quantization & Benchmark**:
  ```bash
  uv run python tools/model_optimization/optimize_iter1.py --force
  uv run python tools/model_optimization/benchmark_iter1.py \
    --output data/benchmark_results/iter1_haswell_benchmark.json
  ```
- **Generate Visual HTML Comparison Report**:
  ```bash
  uv run python scripts/generate_html_report.py
  ```

---

## Testing & Quality Assurance

### Backend Unit Tests (Pytest)
Run the backend unit test suite:

```bash
uv run pytest tests/unit
```

Key test modules include:
- `tests/unit/ocr/test_figure_detector.py`: Validates ONNX model loading, bounding-box outputs, and class filtering.
- `tests/unit/ocr/test_anchored_xml_parser.py`: Tests XML sequence span extraction, option labeling, and stimulus association.
- `tests/unit/ocr/test_long_parser.py`: Verifies long-context chunking and sequence reconciliation.

### Frontend Quality Checks

```bash
cd vite-app

# TypeScript typechecking
npm run typecheck

# ESLint verification
npm run lint

# Code formatting check
npm run format

# Production build test
npm run build
```

---

## Design System & Visual Principles

Azozo adheres to strict Notion-inspired minimalism:

- **The Ten Percent Rule**: Dark primary ink (`#373737`) and active indicators occupy $\le 10\%$ of any single viewport.
- **4px Vertical Grid Rhythm**: All UI spacing, padding, margins, and line heights align to multiples of 4px.
- **Flat Elevation Model**: No exaggerated drop shadows, glassmorphism, or gradient text. Clean `1px` subtle borders (`#E5E7EB` / `#EFEFEF`) define structural hierarchy.
- **Typography**: Inter Variable Font with strict hierarchical scaling and readable line height.
- **Distraction-Free Mode**: Student examination rooms suppress all non-essential navigation controls to maintain testing focus.

---

## License

Private repository. All rights reserved.
