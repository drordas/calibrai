# CalibrAI

Reproducible scientific evaluation, statistical calibration, and psychometric auditing workbench for local (Ollama) and cloud (OpenAI, Gemini, Anthropic) Large Language Models (LLMs), built for qualitative coding, classification, and numeric benchmarks against human Ground Truth annotators.

---

## Docker Compose Deployment

The application is orchestrated with **Docker Compose** across 3 containers:
1. **Database:** PostgreSQL 16 (`calibrai_db`)
2. **Backend API:** FastAPI + DuckDB Engine (`calibrai_backend`)
3. **Frontend Web UI:** React 19 + Tailwind CSS + shadcn/ui served via Nginx (`calibrai_frontend`)

### Quick Start
```bash
cp .env.example .env   # optional: customize ports, secrets, or provider keys
docker compose up -d
```

### Rebuild After Changes
```bash
docker compose up -d --build
```

### Stop Services
```bash
docker compose down
```

---

## Configuration (`.env`)

All ports, database settings, authentication options, and LLM provider keys can be configured in a `.env` file at the project root (see [`.env.example`](.env.example)).

### Ports & Access URLs

| Service | Env Variable | Default Port | Default URL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Web UI** | `FRONTEND_PORT` | `5174` | [http://localhost:5174](http://localhost:5174) | Full web interface (Dashboard, 4-step Wizard, Results & Audit) |
| **Backend API (Swagger Docs)** | `BACKEND_PORT` | `8001` | [http://localhost:8001/docs](http://localhost:8001/docs) | Interactive OpenAPI documentation for FastAPI |
| **PostgreSQL 16** | `DB_PORT` | `5434` | `localhost:5434` | Relational database (`POSTGRES_DB`, `POSTGRES_USER`) |

> **Note:** In Docker mode, the Nginx frontend proxies `/api/` requests directly to `backend:8000` over the internal Docker network, so changing `FRONTEND_PORT` or `BACKEND_PORT` in `.env` requires no extra frontend rebuild.

---

## Authentication

- Create an account directly from the registration screen in the web UI, **or**
- Set `DEFAULT_ADMIN_USER` and `DEFAULT_ADMIN_PASSWORD` in `.env` to automatically seed an initial user on startup.
- Set `JWT_SECRET_KEY` in `.env` before deploying to shared or production environments.

---

## Architecture & Volumes

- **PostgreSQL Persistence:** `postgres_data` volume mounted at `/var/lib/postgresql/data` (configured in `docker-compose.yml`).
- **Uploaded Datasets Persistence:** `backend_uploads` volume mounted at `/app/uploads`.
- **Sample Datasets:** `./dataset` mounted read-only at `/app/dataset` (includes `extracted_target_reviews.csv` and human-annotated Ground Truth files).
- **Local Ollama on Host:** The backend connects to `OLLAMA_BASE_URL` (default `http://host.docker.internal:11434`) to reach an Ollama instance running on the host machine.

---

## Key Capabilities & Metrics

- **4-Step Experiment Wizard:** Dataset & Ground Truth selection, structured Prompt Editor & Linter, Model Selection & VRAM/Hardware sizing, and Execution with live SSE telemetry.
- **Hot Recalculation:** Toggle validation pillars, verbatim strictness, or evaluated fields and recalculate metrics over persisted inferences without re-running models.
- **Row-by-Row Forensic Audit:** Every aggregate score links down to exact dataset rows, model outputs, and verbatim quotes.
- **4 Psychometric & Statistical Validation Pillars:**
  - **Pillar I — Internal Consistency:** 3-level Verbatim Fidelity (with spelling-correction detection) and Polarity Disjunction ($\text{Pos} \cap \text{Neg} = \emptyset$).
  - **Pillar II — Inter-Rater Reliability:** Pairwise Cohen's $\kappa$, Krippendorff's $\alpha$, and Human Baseline Ratio, plus an interactive $N \times N$ consensus heatmap.
  - **Pillar III — Quantitative Evidence Count:** Intraclass Correlation Coefficient $\text{ICC}(2,1)$ and Polarity Count Agreement (PCA) across dimensions.
  - **Pillar IV — External Convergent Validity:** Spearman rank correlation ($\rho$) against external ground truth scores.
- **Operational Telemetry:** Mean latency ($\text{ms}$), throughput ($\text{tok/s}$), estimated cumulative cost ($\$$), and JSON schema compliance rate ($\%$).
