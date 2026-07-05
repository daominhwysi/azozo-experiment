# AGENTS.md

## Project Overview

**Azozo** (Azozo Exam Platform) is an Azota-grade PDF OCR, Sequence Labeling, and Online Examination System featuring a Notion-inspired UI design system.

- **Backend**: FastAPI app (`backend/app/main.py`) providing REST APIs for exam management, PDF parsing, OCR annotation, and LLM sequence labeling.
- **Frontend**: React 19 + TypeScript + Vite web app (`vite-app/`) utilizing Tailwind CSS v4, Lucide icons, and Notion UI aesthetics (`@fontsource-variable/inter`).
- **OCR Engine**: PyMuPDF (`fitz`) based PDF text & image converter, token alignment, and XML annotation parser in `backend/real_data_annotator/`.
- **LLM Engine**: Multi-provider client (`backend/app/services/deepseek_client.py`) supporting DeepSeek, NVIDIA NIM, and Vilao.ai for question extraction and OCR cleanup.

---

## Environment Setup

The repository uses [Pixi](https://pixi.sh) for environment & dependency management (Conda + PyPI), as well as standard `npm` for the React frontend.

### Prerequisites

- Python >= 3.10
- Node.js >= 18 and `npm`
- Pixi (optional but recommended)

### Environment File (`.env`)

Store environment secrets at the project root (`.env`):

```env
LLM_API_KEY=<vilao_or_nvidia_api_key>
DEEPSEEK_API_KEY=<deepseek_api_key>
NVIDIA_API_KEY=<nvidia_api_key>
```

---

## Development Workflow & Commands

### Running Components

- **Backend FastAPI Server**:

  ```bash
  # Using Python
  python backend/app.py

  # Or using Pixi
  pixi run backend
  ```

  - API Base URL: `http://localhost:8000`
  - Interactive API Docs (Swagger): `http://localhost:8000/docs`

- **Frontend Vite App**:

  ```bash
  cd vite-app
  npm run dev
  ```

  - App URL: `http://localhost:5173`

---

## Frontend Commands (`vite-app/`)

All frontend commands should be executed inside the `vite-app/` directory:

- **Start Dev Server**: `npm run dev`
- **TypeScript Check**: `npm run typecheck`
- **Lint Code**: `npm run lint`
- **Format Code**: `npm run format`
- **Production Build**: `npm run build`
- **Preview Build**: `npm run preview`

---

## Project Structure & Architecture

```
azozo/
├── .env                  # API keys and environment configuration
├── pixi.toml             # Environment definition and task automation
├── backend/              # FastAPI Application & Data Layer
│   ├── app/              # Core application package
│   │   ├── config.py     # Workspace paths & configuration
│   │   ├── database.py   # DB handlers for db.json
│   │   ├── models.py     # Pydantic request & response models
│   │   ├── main.py       # FastAPI application initialization & routers
│   │   ├── routers/      # API endpoints (exams.py, ocr.py)
│   │   └── services/     # OCR parser & LLM integration client
│   │       ├── parser.py
│   │       └── deepseek_client.py
│   ├── real_data_annotator/ # PDF OCR & Token Alignment Module
│   │   ├── pdf_converter.py # PyMuPDF text & page renderer
│   │   ├── annotate_ocr.py  # Tokenization and BIO tag alignment
│   │   └── pipeline.py      # Full OCR processing pipeline
│   ├── app.py            # FastAPI entry point launcher
│   └── db.json           # File-based JSON database store
└── vite-app/             # React 19 + TypeScript + Vite Frontend
    ├── src/
    │   ├── components/   # Modular React components (layout, exam, ocr)
    │   ├── services/     # API fetch functions (api.ts)
    │   ├── types/        # TypeScript interfaces (exam.ts)
    │   ├── App.tsx       # Main Application Shell
    │   └── main.tsx      # Entrypoint
    ├── package.json      # NPM package configuration
    └── vite.config.ts    # Vite bundler configuration
```

---

## Data Layer & Persistence

- **Database**: Backend uses a JSON file-based database located at `backend/db.json`.
- **API Endpoints**:
  - `GET /api/exams`: List all active exam papers.
  - `GET /api/exams/{id}`: Fetch detailed exam structure and questions.
  - `POST /api/exams`: Create a new exam.
  - `POST /api/exams/{id}/submit`: Submit exam answers and receive score report.
  - `POST /api/parse-exam`: Upload PDF file or raw text to run OCR parsing & question extraction.

---

## Code Style & Conventions

- **Python**:
  - Follow PEP 8 guidelines.
  - Use type hints wherever applicable.
  - Keep routers clean, using FastAPI Pydantic models for request validation.

- **Frontend & TypeScript**:
  - Modular component architecture (separated components, types, services).
  - Adhere to Notion UI design principles (minimalist, 4px grid rhythm, clean typography with Inter variable font).
  - Use `clsx` and `tailwind-merge` for standard class merging.
  - Run `npm run typecheck` and `npm run lint` inside `vite-app/` before committing changes.
