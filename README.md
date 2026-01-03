# Kidney Triage – FastAPI GPT Proxy (secure, production-ish)

This backend matches the `gpt-bridge.js` contract:

- **POST** `/gpt` with JSON: `{ "text": "..." }`
- Returns JSON: `{ "reply": "..." }`

It is designed to keep **OpenAI API keys off the browser**.

## 1) Install

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 2) Configure

Create a `.env` (or set environment variables):

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)
- `OPENAI_USE_RESPONSES` (default: `true`)  
  - `true` -> uses **Responses API** (`/v1/responses`)
  - `false` -> uses **Chat Completions** (`/v1/chat/completions`)
- `CORS_ORIGINS` (default `*` for dev; set to your domain in production)
- `RATE_LIMIT_RPM` (default `30` per IP)
- `PROXY_AUTH_TOKEN` (optional)  
  If set, clients must send header: `X-Proxy-Token: <token>`

Example:

```bash
export OPENAI_API_KEY="sk-..."
export CORS_ORIGINS="https://your-frontend.example"
export PROXY_AUTH_TOKEN="change-me"
```

## 3) Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Test:

```bash
curl -X POST http://localhost:8000/gpt \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Token: change-me" \
  -d '{"text":"Hello. Summarize: eGFR 84, WBC 7.6, culture staph spp."}'
```

## 4) Front-end wiring

In your PWA, set the proxy URL to something like:

- `https://api.yourdomain.com/gpt`

Then `gpt-bridge.js` will call it with `{text}`.

## Security notes (tell-it-like-it-is)

- This is “production-ish”, not hospital-grade.
- For stronger security: add real authentication, persistent rate limiting, audit logging, and a backend allowlist of origins.
- Never log patient-identifying data.
"# bubulizer-kidney-triage" 
"# bubulizer-kidney-triage" 
