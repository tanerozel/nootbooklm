# NootbookLM

A **source-grounded research assistant** similar to Google NotebookLM, built on OpenSearch. Upload your documents (PDF, DOCX, TXT/MD, web pages), ask questions, and get cited answers — every claim is linked back to the exact source chunk.

---

## Architecture

```
Documents → Ingestion & Chunking → Embedding → OpenSearch (kNN + BM25)
         → Hybrid Search & Rerank → LLM (RAG, cited) → Notebook UI
```

| Layer | Technology |
|---|---|
| Search / Vector store | OpenSearch 2.x (kNN + BM25 hybrid) |
| Backend | Python 3.11 · FastAPI · SQLAlchemy (SQLite metadata) |
| Ingestion / Orchestration | LangChain · pypdf · python-docx |
| Embeddings | OpenAI `text-embedding-3-small` (swappable to HuggingFace) |
| LLM | OpenAI GPT-4o-mini or Anthropic Claude (config-driven) |
| Frontend | Next.js 14 · React 18 · TypeScript · Tailwind CSS |
| Infrastructure | Docker Compose (single command startup) |

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/tanerozel/nootbooklm.git
cd nootbooklm
cp .env.example .env
# Edit .env — at minimum set OPENAI_API_KEY
```

### 2. Start everything

```bash
docker compose up --build
```

Wait ~60 s for OpenSearch to become healthy, then open:

| Service | URL |
|---|---|
| **Frontend** | http://localhost:3000 |
| **API docs** | http://localhost:8000/docs |
| **OpenSearch Dashboards** | http://localhost:5601 |

### 3. Try it

1. Open http://localhost:3000
2. Click **Create** to make a new notebook.
3. Upload a PDF (left panel → upload icon).
4. Wait for the source status to turn **ready**.
5. Type a question in the chat panel.
6. Each answer contains `[source_id::chunk_index]` citations — click them to see the exact source snippet.

---

## One-Click Development Environment

You can open the repository with a ready-to-run development environment in either:

- **GitHub Codespaces** → **Code** → **Codespaces** → **Create codespace**
- **VS Code Dev Containers** → **Reopen in Container**

The dev container:

- starts OpenSearch, the backend, and the frontend with Docker Compose
- creates a local backend virtualenv and installs frontend dependencies for editor tooling
- falls back to `.env.example` on first boot, then copies it to `.env` if the file is missing

After the container finishes booting, use the forwarded ports:

| Service | URL |
|---|---|
| **Frontend** | Port 3000 |
| **API docs** | Port 8000 `/docs` |
| **OpenSearch Dashboards** | Port 5601 |

To use real LLM calls inside Codespaces, replace the placeholder API key in `.env` or set it as a Codespaces secret before launching the environment.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `openai` | `openai` or `anthropic` |
| `OPENAI_API_KEY` | — | Required when `LLM_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_PROVIDER=anthropic` |
| `LLM_MODEL` | `gpt-4o-mini` | Any model supported by the provider |
| `EMBEDDING_PROVIDER` | `openai` | `openai` or `huggingface` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model name |
| `EMBEDDING_DIMENSION` | `1536` | Must match model output dimension |
| `OPENSEARCH_HOST` | `opensearch` | OpenSearch hostname |
| `OPENSEARCH_PORT` | `9200` | OpenSearch port |
| `OPENSEARCH_USER` | `admin` | OpenSearch user |
| `OPENSEARCH_PASSWORD` | `admin` | OpenSearch password |
| `OPENSEARCH_INDEX` | `nootbooklm_chunks` | Index name |
| `OPENSEARCH_USE_SEARCH_PIPELINE` | `true` | Enable OpenSearch hybrid query + search pipeline |
| `OPENSEARCH_SEARCH_PIPELINE` | `nootbooklm_hybrid_pipeline` | Search pipeline name for hybrid normalization |
| `RERANKER_ENABLED` | `false` | Enable cross-encoder reranker |
| `RERANKER_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | SentenceTransformers cross-encoder model |
| `RERANKER_TOP_K` | `8` | Number of retrieved chunks to rerank |
| `CHUNK_SIZE` | `400` | Target chunk size in characters |
| `CHUNK_OVERLAP` | `50` | Chunk overlap in characters |
| `SECRET_KEY` | — | Backend JWT secret (change in production) |
| `BACKEND_CORS_ORIGIN_REGEX` | — | Optional regex for additional dev origins such as Codespaces forwarded URLs |

### Using HuggingFace embeddings (local, no API key needed)

```env
EMBEDDING_PROVIDER=huggingface
EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2
EMBEDDING_DIMENSION=768
```

### Using Anthropic Claude

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-3-haiku-20240307
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/notebooks` | Create a notebook |
| `GET` | `/notebooks` | List all notebooks |
| `GET` | `/notebooks/:id` | Get notebook details |
| `PATCH` | `/notebooks/:id` | Update title/description |
| `DELETE` | `/notebooks/:id` | Delete notebook |
| `POST` | `/notebooks/:id/sources` | Upload file or add URL |
| `GET` | `/notebooks/:id/sources` | List sources |
| `GET` | `/notebooks/:id/sources/:sid` | Get source status |
| `DELETE` | `/notebooks/:id/sources/:sid` | Delete source |
| `POST` | `/notebooks/:id/chat` | Ask a question (RAG) |
| `GET` | `/notebooks/:id/chat/history` | Get chat history |
| `DELETE` | `/notebooks/:id/chat/history` | Clear chat history |
| `GET` | `/notebooks/:id/notes` | Get notebook notes |
| `PUT` | `/notebooks/:id/notes` | Update notebook notes |

Full interactive docs: http://localhost:8000/docs

---

## Project Structure

```
nootbooklm/
├── .devcontainer/
│   ├── devcontainer.json
│   ├── docker-compose.yml
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py            # FastAPI app
│       ├── config.py          # Settings (pydantic-settings)
│       ├── models.py          # SQLAlchemy ORM models
│       ├── database.py        # Async SQLite engine
│       ├── api/
│       │   ├── notebooks.py   # Notebook CRUD
│       │   ├── sources.py     # Source upload & ingestion trigger
│       │   ├── chat.py        # RAG chat endpoint
│       │   ├── notes.py       # Note-taking endpoint
│       │   └── schemas.py     # Pydantic request/response schemas
│       ├── ingestion/
│       │   ├── loaders.py     # PDF, DOCX, text, URL loaders
│       │   ├── chunker.py     # RecursiveCharacterTextSplitter
│       │   └── pipeline.py    # load → chunk → embed → index
│       ├── retrieval/
│       │   ├── embeddings.py  # OpenAI / HuggingFace embedder factory
│       │   └── search.py      # OpenSearch index + hybrid search
│       └── llm/
│           ├── client.py      # LLM factory (OpenAI / Anthropic)
│           └── rag.py         # RAG pipeline with citation extraction
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx                  # Notebook list
        │   └── notebooks/[id]/page.tsx   # 3-panel notebook UI
        ├── components/
        │   ├── SourcePanel.tsx    # Upload, status, source list
        │   ├── ChatPanel.tsx      # Chat with inline citations
        │   ├── NotePanel.tsx      # Auto-saving notes
        │   └── CitationPreview.tsx # Source snippet on click
        ├── lib/api.ts             # Axios API client
        └── types/index.ts         # TypeScript interfaces
```

---

## Development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Start OpenSearch separately (or use docker compose up opensearch)
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Acceptance Criteria

- ✅ A PDF is automatically chunked and indexed into OpenSearch on upload.
- ✅ Hybrid search (BM25 + kNN) — both keyword and semantic signals contribute.
- ✅ Every answer contains at least one `[source_id::chunk_index]` citation.
- ✅ When the answer is not in the sources, the system responds: *"I cannot find information about this in the provided sources."*
- ✅ Notebooks are fully isolated — `notebook_id` filter ensures no cross-notebook leakage.

---

## Development Roadmap

| Phase | Status | Description |
|---|---|---|
| 0 — PoC | ✅ | End-to-end flow: upload → index → hybrid search → cited answer |
| 1 — Ingestion | 🚧 | Async ingestion is active; progress tracking + markdown support delivered, queue/events expansion in progress |
| 2 — Hybrid & Rerank | ✅ | Cross-encoder reranker, OpenSearch search pipelines |
| 3 — Conversation | ✅ | Multi-turn context window management |
| 4 — Advanced UI | ✅ | Source viewer, drag-and-drop, keyboard shortcuts |
| 5 — Advanced features | 🔜 | Auto-summary, audio briefing, multi-user sharing |
| 6 — Hardening | 🔜 | Auth, rate limiting, observability, cost control |
