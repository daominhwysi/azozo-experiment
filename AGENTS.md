# AGENTS.md

## Project Overview

**Azozo** (Azozo Exam Platform) is an Azota-grade PDF OCR, Sequence Labeling, and Online Examination System featuring a Notion-inspired UI design system.

- **Backend**: FastAPI app (`backend/app/main.py`) organized into domain modules (`core`, `domains/exams`, `domains/ocr`, `domains/llm`).
- **Frontend**: React 19 + TypeScript + Vite web app (`vite-app/`) with feature-based architecture (`features/exam`, `features/ocr`, `layouts`, `components/ui`).
- **OCR Engine**: PyMuPDF (`fitz`) based PDF text & image converter, token alignment, and XML annotation parser in `backend/app/domains/ocr/annotator/`.
- **LLM Engine**: Multi-provider client (`backend/app/domains/llm/deepseek_client.py`) supporting DeepSeek, NVIDIA NIM, and Vilao.ai.

---

## Environment Setup

The repository uses [uv](https://docs.astral.sh/uv/) for Python environment & dependency management, and standard `npm` for the React frontend.

### Default Runtime Convention

- Use `bash` as the default shell for local command execution.
- Use `uv` for Python command execution and virtualenv workflows.
- Default to `uv` runtime for backend-related commands.

### Prerequisites

- Python >= 3.10
- Node.js >= 18 and `npm`
- uv (for backend environment and dependency management)

### Environment File (`.env`)

Store environment secrets at the project root (`.env`):

```env
LLM_API_KEY=<vilao_or_nvidia_api_key>
DEEPSEEK_API_KEY=<deepseek_api_key>
NVIDIA_API_KEY=<nvidia_api_key>
```

---

## Development Workflow & Commands

### Git Integration & Feature Completion

- **Branch & Push Rule**: Upon finishing every feature/task, the agent **MUST** call the interactive `ask_question` tool to ask the user if they want to create a new branch and push the changes to GitHub. Do not commit or push without asking first.

### Running Components

- **Backend FastAPI Server**:

  ```bash
  # Setup (first time)
  uv venv .venv
  source .venv/bin/activate
  uv pip install -r requirements.txt

  # Run server
  uv run python backend/app.py
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
├── requirements.txt       # Python dependency list for uv workflows
├── backend/              # FastAPI Application & Data Layer
│   ├── app/              # Core application package
│   │   ├── core/         # Config & DB persistence (config.py, database.py)
│   │   ├── domains/      # Domain modules
│   │   │   ├── exams/    # Exam models & endpoints (models.py, router.py)
│   │   │   ├── ocr/      # OCR annotator, parser engine & endpoints
│   │   │   │   ├── annotator/ # PyMuPDF converter & token alignment
│   │   │   │   ├── parser/    # Question extraction & deterministic parsers
│   │   │   │   └── router.py  # OCR API endpoints
│   │   │   └── llm/      # DeepSeek / NIM / Vilao integration & logger
│   │   └── main.py       # FastAPI application entrypoint & router aggregation
│   ├── app.py            # Uvicorn launcher
│   └── azozo.db          # SQLite database store
└── vite-app/             # React 19 + TypeScript + Vite Frontend
    ├── src/
    │   ├── components/   # Shared primitive components (ui/)
    │   ├── features/     # Domain feature components (exam/, ocr/)
    │   ├── layouts/      # App layout components (Header.tsx, Sidebar.tsx)
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

---

## Design Context & Guidelines

When working on the frontend interface, refer to these primary documents:
- [PRODUCT.md](file:///home/minh1/project/azozo/PRODUCT.md): Strategic foundation including register (`product`), platform (`web`), user breakdown, and principles.
- [DESIGN.md](file:///home/minh1/project/azozo/DESIGN.md): Technical visual specification including colors, typography hierarchy, flat elevation model, and component styles.

### Core Visual Rules
- **The Ten Percent Rule**: Limit the primary accent color (`Deep Ink` #373737) and active indicators to 10% or less of any single viewport.
- **Grid Rhythm**: Keep layouts aligned to a strict 4px vertical rhythm.
- **Banned Patterns**: Do not use side-stripe borders (e.g. `border-l-3` or `border-l-2` colored accents on one side of a card), nested cards, gradient text, or glassmorphism.

---

## Agent Persona & Technical Objectivity Guidelines

To ensure rigorous, unbiased, and state-of-the-art engineering pair programming, the AI agent must strictly adhere to the following behavioral standards:

- **Zero Sycophancy & Flattery**: Do not compliment user prompts, praise user ideas (e.g., avoid "Brilliant idea!", "Spot-on!"), or use performative agreement. Maintain a neutral, matter-of-fact tone.
- **Unbiased Technical Rigor**: Evaluate code and architecture objectively based strictly on engineering trade-offs (correctness, edge cases, complexity, latency, and memory footprint).
- **Direct Pushback & Trade-off Analysis**: If a user-suggested approach has drawbacks, edge cases, or potential over-engineering, state the trade-offs plainly and present comparative evidence before adopting any change.
- **No Wavering or Flip-Flapping**: Stand by sound technical recommendations unless empirical log evidence or concrete edge cases demonstrate otherwise. When revising a plan, focus strictly on technical delta and factual justification.
