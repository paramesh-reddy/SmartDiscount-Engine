# Opptra Discount Engine

Dashboard for discount rules, shopping carts, and a line-by-line discount breakdown. You can add rules by hand, describe a rule in plain language, or import cart lines from a PDF.

The UI runs with the Node API on one local server. Data stays in memory until you set a Postgres URL. A separate Python API lives in `backend/` for a Postgres deployment.

## Folders

```
frontend/     React app (pages, components, API client)
backend/      FastAPI app (Postgres, OpenAI, PDF extraction)
server/       Node API used by the local app
server.ts     Starts the API and the UI together
sample-data/  Example cart and rule CSV files
tests/        Discount engine and API tests
```

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API docs are at [http://localhost:3000/docs](http://localhost:3000/docs).

Copy `.env.example` to `.env` only if you want Postgres or an AI key. Without those, carts and rules still work, and the AI builder uses a local parser.

```bash
npm test
npm run build
```

`npm run build` writes the UI to `frontend/dist`. Start that build with `NODE_ENV=production npm run dev`.

## Pages

| Path | What it does |
| --- | --- |
| `/` | Overview of rules, the active cart, and the latest total |
| `/rules` | Create, edit, and filter discount rules |
| `/cart` | Build a cart and import lines from CSV |
| `/ai-builder` | Turn a sentence into a discount rule |
| `/pdf-upload` | Extract cart lines from a PDF |
| `/results` | Item, brand, platform, and cart discount breakdown |

Rules can be a percentage or a flat amount, scoped to a platform, a brand, or the whole cart. The engine applies non-stackable platform and brand rules first, then stackable ones, then one cart-level rule when the minimum cart value is met.

## Python API

`backend/` is the same product as a FastAPI service. It expects Neon or another Postgres database.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Set `DATABASE_URL` and `OPENAI_API_KEY` in `backend/.env`. Interactive docs are at [http://localhost:8000/docs](http://localhost:8000/docs). Point the UI at it with `VITE_API_BASE_URL=http://localhost:8000/api/v1` if you run the React app against this API instead of the Node server.
