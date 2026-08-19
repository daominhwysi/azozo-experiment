# AGENTS.md

## Project Overview

**Azozo** (Azozo Exam Platform) is an Azota-grade PDF OCR, Sequence Labeling, and Online Examination System featuring a Notion-inspired UI design system.

- **Backend**: FastAPI app (`backend/app/main.py`) structured into domain modules (`core`, `domains/exams`, `domains/ocr`, `domains/llm`).
- **Frontend**: React 19 + TypeScript + Vite web app (`vite-app/`) with feature-based architecture (`features/exam`, `features/ocr`, `layouts`, `components/ui`).
- **OCR & Figure Detection Engine**: PyMuPDF (`fitz`) rasterizer, ONNX INT8 RF-DETR object detector (`export_onnx/iter1-haswell-int8.onnx`), token alignment, and XML annotation parser in `backend/app/domains/ocr/`.
- **LLM Engine**: Multi-provider client (`backend/app/domains/llm/deepseek_client.py`) supporting Xah.io, CommandCode, DeepSeek, NVIDIA NIM, and Vilao.ai with configurable thinking budgets.
- **Data Persistence**: Lightweight JSON file database (`backend/db.json`) and SQLite database store (`backend/azozo.db`).

---

## Environment Setup

The repository uses [uv](https://docs.astral.sh/uv/) for Python environment & dependency management, and standard `npm` for the React frontend.

### Default Runtime Convention

- Use `bash` as the default shell for local command execution.
- Use `uv` for Python command execution and virtualenv workflows (`uv run ...`).
- Default to `uv` runtime for all backend-related commands.

### Prerequisites

- Python `>= 3.10` (recommended: Python 3.11 or 3.12)
- Node.js `>= 18` and `npm`
- uv (for backend environment and dependency management)

### Environment Secrets (`.env`)

Store environment secrets at the project root (`.env`):

```env
LLM_API_KEY=<vilao_or_xah_api_key>
DEEPSEEK_API_KEY=<deepseek_api_key>
NVIDIA_API_KEY=<nvidia_api_key>
XAH_API_KEY=<xah_api_key>
CMD_API_KEY=<commandcode_api_key>
```

### Configuration Source of Truth (`backend/config.yaml`)

All model routing, provider endpoints, token limits, and figure detection parameters are configured in `backend/config.yaml` and loaded via `backend/app/core/config.py`. Do not hardcode model names or API endpoints in Python domain modules.

---

## Development Workflow & Exact Commands

### Git Integration & Feature Completion Rule

- **Branch & Push Rule**: Upon finishing every feature/task, the agent **MUST** call the interactive `ask_question` tool to ask the user if they want to create a new branch and push the changes to GitHub. Do not commit or push without asking first.

### Backend Commands (`backend/`)

All backend commands can be run from the repository root:

- **Virtual Environment Setup**:
  ```bash
  uv venv .venv
  source .venv/bin/activate
  uv pip install -r requirements.txt
  ```

- **Run Server (Uvicorn Launcher)**:
  ```bash
  uv run python backend/app.py
  ```
  - API Base URL: `http://localhost:8000`
  - Interactive Swagger Docs: `http://localhost:8000/docs`
  - Health Check: `http://localhost:8000/api/health`

- **Run Unit Tests (Pytest)**:
  ```bash
  uv run pytest tests/unit
  ```

- **Run Specific Unit Test Modules**:
  ```bash
  uv run pytest tests/unit/ocr/test_figure_detector.py
  uv run pytest tests/unit/ocr/test_anchored_xml_parser.py
  uv run pytest tests/unit/ocr/test_long_parser.py
  ```

### Frontend Commands (`vite-app/`)

All frontend commands must be executed inside the `vite-app/` directory:

- **Install Dependencies**: `npm install`
- **Start Dev Server**: `npm run dev` (URL: `http://localhost:5173`)
- **TypeScript Check**: `npm run typecheck`
- **Lint Code**: `npm run lint`
- **Format Code**: `npm run format`
- **Production Build**: `npm run build`
- **Preview Build**: `npm run preview`

---

## Project Structure & Architecture

```
azozo/
├── .agents/                      # Agent skills and prompt guides
│   └── skills/
│       ├── create-agentsmd/      # AGENTS.md generation skill
│       ├── doc-annotator/        # Verbatim manual sequence labelling skill
│       ├── hallmark/             # Anti-AI-slop design system skill
│       ├── notion-ui-skills/     # Notion design guideline skill
│       └── subagent-parser/      # Multi-agent parallel parsing orchestrator
├── .env                          # API keys and environment secrets
├── backend/                      # FastAPI Application & Data Layer
│   ├── app/                      # Core application package
│   │   ├── core/                 # Config loader (config.py) & DB persistence (database.py)
│   │   ├── domains/              # Domain modules
│   │   │   ├── exams/            # Exam CRUD, submissions & answer key mapper
│   │   │   │   ├── models.py     # Pydantic models for exams & submissions
│   │   │   │   └── router.py     # Exam API endpoints (/api/exams)
│   │   │   ├── llm/              # Multi-provider client & structured logger
│   │   │   │   ├── deepseek_client.py # Multi-provider client (XAH, NIM, DeepSeek, Vilao, CMD)
│   │   │   │   └── llm_logger.py # Audit logger for prompt/completion traces
│   │   │   └── ocr/              # OCR annotator, figure detector & parser engines
│   │   │       ├── annotator/    # PDF converter, RF-DETR detector, XML system prompts
│   │   │       │   ├── annotate_ocr.py   # Full OCR conversion pipeline
│   │   │       │   ├── figure_detector.py # ONNX RF-DETR object detector
│   │   │       │   ├── pdf_converter.py  # PyMuPDF rasterizer & token aligner
│   │   │       │   ├── prompt_annotator.md # Verbatim XML sequence labelling prompt
│   │   │       │   └── examples/         # Few-shot sequence labelling golden samples
│   │   │       ├── parser/       # Deterministic & Long-Context Chunker/Merger parsers
│   │   │       │   ├── deterministic_parser.py # High-speed regex/rule-based parser
│   │   │       │   ├── parser.py         # High-level parser facade
│   │   │       │   ├── ocr_logger.py     # Request/response audit logger
│   │   │       │   └── long_parser/      # Multi-pass chunked sequence reconciler
│   │   │       │       ├── greedy_chunker.py        # Passage-locked chunker
│   │   │       │       ├── anchored_xml_llm_parser.py # Sequence labeling worker
│   │   │       │       ├── linking_agent.py         # Graph entity resolver
│   │   │       │       ├── sequence_reconciler.py   # Multi-variant reconciler
│   │   │       │       ├── pipeline.py              # LongContextParserPipeline
│   │   │       │       └── source_merger/           # Canonical source merger & lexer
│   │   │       └── router.py     # OCR API endpoints (/api/parse-exam, /api/ocr-tasks)
│   │   └── main.py               # FastAPI application entrypoint & router aggregation
│   ├── app.py                    # Uvicorn server launcher
│   ├── azozo.db                  # SQLite database store
│   ├── config.yaml               # Model, provider, chunker & detector configuration
│   └── db.json                   # JSON file-based database
├── export_onnx/                  # Quantized ONNX detection models
│   ├── iter1-haswell-int8.onnx   # Production INT8 RF-DETR figure detector (45MB)
│   ├── rfdetr-small-int8.onnx    # Small quantized detector
│   └── rfdetr-small.onnx         # Full precision reference model
├── logs/                         # Structured audit logs
│   ├── ocr_logs/                 # OCR and annotation request dumps
│   └── llm_logs/                 # LLM token usage and call history
├── pytest.ini                    # Pytest configuration
├── requirements.txt              # Python dependency list for uv workflows
├── scripts/                      # Operational & data curation scripts
│   ├── annotate_sequence_labelling_dataset.py # Batch sequence labeling script
│   ├── batch_ocr_raw_dataset.py  # Batch PDF OCR runner with 3-level progress bars
│   ├── eval_new_deterministic_parser.py # Parser accuracy evaluation benchmark
│   └── generate_html_report.py   # Visual comparison HTML report generator
├── tests/                        # Automated test suites
│   └── unit/                     # Pytest unit tests (figure detector, parser, merger)
├── tools/                        # Diagnostic and model optimization tools
│   ├── check_ocr_status.py       # Batch OCR progress monitor
│   ├── detailed_ocr_audit.py     # OCR accuracy and tag audit utility
│   └── model_optimization/       # INT8 dynamic quantization & CPU benchmarks
│       ├── optimize_iter1.py     # INT8 dynamic quantization script
│       └── benchmark_iter1.py    # Quantized model benchmark suite
└── vite-app/                     # React 19 + TypeScript + Vite Frontend
    ├── src/
    │   ├── components/ui/        # Shared UI components (Button, Card, Dialog, etc.)
    │   ├── features/
    │   │   ├── exam/             # Exam taker, Student Room, Gradebook, Exam Editor
    │   │   └── ocr/              # PDF Annotator workspace & question preview cards
    │   ├── layouts/              # Header and navigation sidebar layouts
    │   ├── services/api.ts       # Typed API client for FastAPI backend
    │   ├── types/exam.ts         # TypeScript interfaces for exams & questions
    │   ├── App.tsx               # Main Application Shell
    │   └── main.tsx              # React Entrypoint
    ├── package.json              # NPM package configuration
    └── vite.config.ts            # Vite bundler configuration
```

---

## Data Layer & API Endpoints

### Database Architecture
- **Primary Store**: JSON file database located at `backend/db.json` containing `exams` and `submissions` collections.
- **Task Store**: In-memory dictionary `ocr_tasks` tracking background asynchronous OCR jobs (`/api/ocr-tasks`).
- **Audit Logs**: Request/response payloads saved to `logs/ocr_logs/` and LLM call history to `logs/llm_logs/`.

### Core API Endpoints

- **Exam Domain (`/api/exams`)**:
  - `GET /api/exams`: List all active exam papers.
  - `GET /api/exams/{id}`: Fetch detailed exam structure, questions, and options.
  - `POST /api/exams`: Create a new exam paper.
  - `PUT /api/exams/{id}`: Update exam metadata and questions.
  - `DELETE /api/exams/{id}`: Delete an exam and all related submissions.
  - `POST /api/exams/{id}/submit`: Submit student responses and receive instant grading.
  - `GET /api/exams/submissions`: List student submissions (optional filter by `exam_id`).
  - `DELETE /api/exams/submissions/{id}`: Delete a submission record.
  - `POST /api/exams/{id}/import-answers`: LLM-based unstructured answer key alignment to questions.

- **OCR & Parser Domain (`/api`)**:
  - `POST /api/parse-exam`: Synchronous PDF or raw text upload -> OCR -> Sequence Labeling -> Questions.
  - `POST /api/parse-exam-stream`: Server-Sent Events (SSE) streaming OCR conversion & token progress.
  - `POST /api/parse-exam/long-context`: Multi-pass chunker & sequence reconciler for large PDF exams.
  - `POST /api/ocr-tasks`: Enqueue background async OCR job with optional auto-save to Exam Bank.
  - `GET /api/ocr-tasks`: List all background OCR tasks.
  - `GET /api/ocr-tasks/{id}`: Get status and result of a specific OCR task.
  - `DELETE /api/ocr-tasks/{id}`: Cancel/delete an OCR task.
  - `GET /api/health`: Service health check.

---

## OCR, Sequence Labeling & Figure Detection Specification

### 1. 100% Verbatim Sequence Labeling Rule
- **Character Offset Preservation**: The sequence labeling engine must preserve source OCR text verbatim. Zero paraphrasing, zero text deletion, and zero grammatical rewriting.
- **XML Tag Hierarchy**:
  - `<section title="...">...</section>`: Major exam section wrappers.
  - `<stimulus id="stim_N">...</stimulus>`: Reading passage or shared problem context serving multiple questions.
  - `<stem>...</stem>`: Question stem text.
  - `<option id="A|B|C|D">...</option>`: Multiple choice answer options.
  - `<explanation>...</explanation>`: Official solution/explanation text.
  - `<figure id="fig_N" description="..." bbox="x1,y1,x2,y2" />`: Inline illustration anchor with projected bounding box.

### 2. INT8 ONNX Figure Detection
- Figure detection is managed by `backend/app/domains/ocr/annotator/figure_detector.py`.
- Model: `export_onnx/iter1-haswell-int8.onnx` (dynamic per-channel signed INT8 for MatMul nodes).
- Detects general figures (class `1`), generates visual badges, and deterministically projects bounding box coordinates back to original rendered PDF dimensions.

---

## Available Agent Skills (`.agents/skills/`)

- `doc-annotator`: Directly annotates raw OCR exam documents into sequence-labelled XML format without subagents, preserving 100% verbatim text and XML tags.
- `subagent-parser`: Orchestrates parallel subagents to parse raw OCR exam documents into sequence-labelled XML outputs using sliding-window concurrency.
- `hallmark`: Anti-AI-slop design skill for clean, production-grade frontend audits, redesigns, and greenfield pages.
- `notion-ui-skills`: Notion's UI design system (light mode default, Inter font, 4px vertical rhythm, flat elevation).
- `create-agentsmd`: Standardized generator skill for `AGENTS.md` repository guidelines.

---

## Code Style & Conventions

### Python
- Follow PEP 8 guidelines.
- Use strict type hints wherever applicable.
- Keep routers clean, using FastAPI Pydantic models for request/response validation.
- All model routing and provider access must go through `backend/app/core/config.py` and `backend/config.yaml`.

### Frontend & TypeScript
- Modular component architecture (`components/ui`, `features/exam`, `features/ocr`, `layouts`).
- Adhere to Notion UI design principles (minimalist, 4px grid rhythm, clean typography with Inter variable font).
- Use `clsx` and `tailwind-merge` for class merging (`cn(...)` utility in `@/lib/utils`).
- Run `npm run typecheck` and `npm run lint` inside `vite-app/` before finishing any frontend task.

---

## Design Context & Guidelines

When modifying or adding frontend interfaces, consult:
- [PRODUCT.md](file:///home/daominhwysi/project/azozo-experiment/PRODUCT.md): Product vision, user personas, positioning, and accessibility standards.
- [DESIGN.md](file:///home/daominhwysi/project/azozo-experiment/DESIGN.md): Visual design specifications, color tokens, typography scales, and component standards.

### Core Visual Rules
- **The Ten Percent Rule**: Limit the primary dark ink (`#373737`) and active indicators to 10% or less of any single viewport.
- **Grid Rhythm**: Keep layouts strictly aligned to a 4px vertical rhythm (`p-2`, `p-4`, `space-y-4`, `gap-2`, etc.).
- **Banned Patterns**: Do not use side-stripe borders (e.g. `border-l-3` colored accents on one side of a card), nested cards, gradient text, or glassmorphism.

---

## Agent Persona & Technical Objectivity Guidelines

To ensure rigorous, unbiased, and state-of-the-art engineering pair programming, the AI agent must strictly adhere to the following behavioral standards:

- **Zero Sycophancy & Flattery**: Do not compliment user prompts, praise user ideas (e.g., avoid "Brilliant idea!", "Spot-on!"), or use performative agreement. Maintain a neutral, matter-of-fact tone.
- **Unbiased Technical Rigor**: Evaluate code and architecture objectively based strictly on engineering trade-offs (correctness, edge cases, complexity, latency, and memory footprint).
- **Direct Pushback & Trade-off Analysis**: If a user-suggested approach has drawbacks, edge cases, or potential over-engineering, state the trade-offs plainly and present comparative evidence before adopting any change.
- **No Wavering or Flip-Flapping**: Stand by sound technical recommendations unless empirical log evidence or concrete edge cases demonstrate otherwise. When revising a plan, focus strictly on technical delta and factual justification.
