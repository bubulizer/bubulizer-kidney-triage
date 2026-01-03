import os
import time
from typing import Optional, Dict, Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "BUBULIZER Kidney Triage GPT Proxy"
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
USE_RESPONSES = os.getenv("OPENAI_USE_RESPONSES", "true").lower() in ("1", "true", "yes", "y")

# Optional: protect this proxy with a simple shared token
PROXY_AUTH_TOKEN = os.getenv("PROXY_AUTH_TOKEN", "")  # if set, require header X-Proxy-Token

# CORS: set to your deployed front-end origin(s), comma-separated, or "*" for dev
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# Basic in-memory rate limit per IP (good enough for "production-ish" demo)
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "30"))  # requests per minute per IP
_MAX_BODY_CHARS = int(os.getenv("MAX_BODY_CHARS", "25000"))

# -------------------------
# Rate limiter (token bucket)
# -------------------------
_bucket: Dict[str, Dict[str, float]] = {}  # ip -> {"tokens": float, "ts": float}

def _allow(ip: str) -> bool:
    now = time.time()
    b = _bucket.get(ip)
    if not b:
        _bucket[ip] = {"tokens": float(RATE_LIMIT_RPM), "ts": now}
        return True
    # refill tokens based on elapsed time
    elapsed = now - b["ts"]
    refill = (elapsed / 60.0) * RATE_LIMIT_RPM
    b["tokens"] = min(float(RATE_LIMIT_RPM), b["tokens"] + refill)
    b["ts"] = now
    if b["tokens"] >= 1.0:
        b["tokens"] -= 1.0
        return True
    return False

# -------------------------
# FastAPI app
# -------------------------
app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

class GPTRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=_MAX_BODY_CHARS)

class GPTResponse(BaseModel):
    reply: str

def _require_auth(req: Request):
    if not PROXY_AUTH_TOKEN:
        return
    token = req.headers.get("X-Proxy-Token", "")
    if token != PROXY_AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized (missing/invalid X-Proxy-Token)")

def _client_ip(req: Request) -> str:
    # If behind a proxy/CDN, ensure your deployment sets these correctly.
    xff = req.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return req.client.host if req.client else "unknown"

def _system_prompt() -> str:
    # Keep this safe: no prescribing, no dosing, highlight red flags.
    return (
        "You are a clinical decision-support assistant for educational use in Africa. "
        "Do NOT prescribe antibiotics or provide dosing. "
        "Provide differential considerations, red flags, and next-step questions. "
        "Offer safe, non-prescriptive symptom relief suggestions only. "
        "If danger signs exist, advise urgent in-person care."
    )

async def _call_openai(text: str) -> str:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="Server misconfigured: OPENAI_API_KEY not set")

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if USE_RESPONSES:
            # Responses API
            url = f"{OPENAI_BASE_URL.rstrip('/')}/responses"
            payload: Dict[str, Any] = {
                "model": DEFAULT_MODEL,
                "input": [
                    {"role": "system", "content": _system_prompt()},
                    {"role": "user", "content": text},
                ],
                "temperature": 0.2,
            }
            r = await client.post(url, headers=headers, json=payload)
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Upstream error: {r.status_code} {r.text}")
            data = r.json()
            # Attempt to extract text output robustly
            # Typical structure: output[0].content[0].text
            try:
                out = data.get("output", [])
                for item in out:
                    content = item.get("content", [])
                    for c in content:
                        if c.get("type") == "output_text" and "text" in c:
                            return c["text"]
                # fallback
                return json.dumps(data, ensure_ascii=False)[:4000]
            except Exception:
                return json.dumps(data, ensure_ascii=False)[:4000]
        else:
            # Chat Completions API
            url = f"{OPENAI_BASE_URL.rstrip('/')}/chat/completions"
            payload = {
                "model": DEFAULT_MODEL,
                "messages": [
                    {"role": "system", "content": _system_prompt()},
                    {"role": "user", "content": text},
                ],
                "temperature": 0.2,
            }
            r = await client.post(url, headers=headers, json=payload)
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Upstream error: {r.status_code} {r.text}")
            data = r.json()
            try:
                return data["choices"][0]["message"]["content"]
            except Exception:
                return json.dumps(data, ensure_ascii=False)[:4000]

@app.get("/health")
async def health():
    return {"status": "ok", "app": APP_NAME}

@app.post("/gpt", response_model=GPTResponse)
async def gpt(req: Request, body: GPTRequest):
    _require_auth(req)

    ip = _client_ip(req)
    if not _allow(ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again shortly.")

    text = body.text.strip()
    if len(text) > _MAX_BODY_CHARS:
        raise HTTPException(status_code=413, detail=f"Payload too large (>{_MAX_BODY_CHARS} chars)")

    reply = await _call_openai(text)
    return {"reply": reply}
