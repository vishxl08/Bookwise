# Bookwise — AI Book Companion

Bookwise is a full-stack web app that helps you discover books, explore mood-based recommendations, and chat with an AI companion about any title — with optional spoiler-safe mode.

![Stack](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Stack](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![AI](https://img.shields.io/badge/Groq-Llama_3.3_70B-f55036)

---

## Features

- **Book search** — Live results from [Open Library](https://openlibrary.org/) with Google Books fallback
- **Mood search** — Describe a vibe (“dark and mysterious”) and get matching titles
- **AI chat** — Ask questions about plot, characters, themes, and symbols
- **Spoiler mode** — Toggle off to avoid twists and ending details
- **Book insights** — Chapter breakdown, character map, themes, mood graph (AI-powered via Groq)
- **Personal library** — Register, log in, and save books (JWT auth + SQLite)
- **Buy / borrow links** — Quick links to Amazon, Google Books, and Libby

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 6, Tailwind CSS 3, Lucide icons |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy, Pydantic |
| **Database** | SQLite (`bookwise.db`) |
| **Auth** | JWT (python-jose) + bcrypt password hashing |
| **AI** | [Groq API](https://console.groq.com/) — `llama-3.3-70b-versatile` |
| **Book data** | Open Library API, Google Books API (optional key) |

---

## Project Structure

```
book/
├── backend/
│   ├── main.py           # FastAPI routes
│   ├── auth.py           # JWT + password utilities
│   ├── config.py         # Settings from .env
│   ├── database.py       # SQLAlchemy engine
│   ├── models.py         # User, LibraryItem, SavedAnswer
│   ├── schemas.py        # Pydantic request/response models
│   └── services/
│       ├── books.py      # Open Library + Google Books search
│       └── groq.py       # Groq AI chat & insights
├── src/
│   ├── App.jsx           # Main UI
│   ├── main.jsx          # React entry
│   └── index.css         # Tailwind + custom theme
├── .env.example          # Environment template
├── package.json          # Frontend scripts & deps
├── vite.config.js        # Dev server + API proxy
└── index.html
```

---

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **Groq API key** — free at [console.groq.com](https://console.groq.com/)
- *(Optional)* Google Books API key for search fallback

---

## Setup

### 1. Clone and enter the project

```bash
cd book
```

### 2. Environment variables

Copy the example file and add your Groq key:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=sqlite:///./bookwise.db
GROQ_API_KEY=gsk_your_key_here
SECRET_KEY=any_random_string_for_jwt
GOOGLE_BOOKS_API_KEY=          # optional
```

> **Note:** `.env` is gitignored. Never commit real API keys to `.env.example`.

### 3. Python backend

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r backend/requirements.txt
```

### 4. Frontend dependencies

```bash
npm install
```

---

## Running the App

You need **two terminals** — backend and frontend.

**Terminal 1 — Backend** (from project root, with venv activated):

```bash
npm run dev:backend
```

API runs at `http://127.0.0.1:8000`  
Health check: `http://127.0.0.1:8000/api/health`

**Terminal 2 — Frontend:**

```bash
npm run dev
```

Open **http://127.0.0.1:5173** in your browser.

Vite proxies `/api/*` requests to the backend automatically.

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/books/search?q=&mood=` | Search books |
| `GET` | `/api/books/insights?title=&author=&spoilers=` | AI book insights |
| `POST` | `/api/chat` | Chat about a book |
| `GET` | `/api/library` | List saved books (auth) |
| `POST` | `/api/library` | Add book to library (auth) |

### Example: Chat request

```bash
curl -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"book_title":"The Night Circus","question":"What is the main theme?","spoilers":false}'
```

---

## AI Details

Bookwise uses **Groq** with the **`llama-3.3-70b-versatile`** model:

- **Chat** (`/api/chat`) — Literary Q&A with spoiler-aware prompts
- **Insights** (`/api/books/insights`) — Structured JSON: chapters, characters, themes, mood graph, similar books

If `GROQ_API_KEY` is missing or the API fails, the app falls back to static placeholder content so the UI still works.

---

## Build for Production

```bash
npm run build
```

Output goes to `dist/`. Serve it with any static host and run the FastAPI backend separately (e.g. with `uvicorn backend.main:app --host 0.0.0.0 --port 8000`).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| AI replies are generic | Check `GROQ_API_KEY` in `.env` and restart the backend |
| Search returns nothing | Open Library may be slow; add `GOOGLE_BOOKS_API_KEY` for fallback |
| `ModuleNotFoundError: backend` | Run uvicorn from the **project root**, not inside `backend/` |
| CORS errors | Frontend must use port `5173`; backend allows `127.0.0.1:5173` |

---

## License

Private project — use and modify as you like.
