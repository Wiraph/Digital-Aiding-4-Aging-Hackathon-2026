from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


NOTEBOOKLM_BASE_URL = os.getenv("NOTEBOOKLM_SERVER_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
NOTEBOOKLM_TOKEN = os.getenv("NOTEBOOKLM_SERVER_TOKEN", "")
BRIDGE_TOKEN = os.getenv("NOTEBOOKLM_BRIDGE_TOKEN", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("NOTEBOOKLM_BRIDGE_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
REQUEST_TIMEOUT_SECONDS = float(os.getenv("NOTEBOOKLM_BRIDGE_TIMEOUT_SECONDS", "180"))


class AskRequest(BaseModel):
    notebook_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)
    conversation_id: str | None = None


class AskResponse(BaseModel):
    notebook_id: str
    answer: Any = None
    references: Any = None
    conversation_id: str | None = None
    raw: dict[str, Any]


def require_bridge_token(authorization: str | None = Header(default=None)) -> None:
    if not BRIDGE_TOKEN:
        return
    expected = f"Bearer {BRIDGE_TOKEN}"
    if authorization != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bridge token",
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not NOTEBOOKLM_TOKEN:
        raise RuntimeError("NOTEBOOKLM_SERVER_TOKEN is required")

    app.state.http = httpx.AsyncClient(
        base_url=NOTEBOOKLM_BASE_URL,
        timeout=httpx.Timeout(REQUEST_TIMEOUT_SECONDS),
        headers={
            "Authorization": f"Bearer {NOTEBOOKLM_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        yield
    finally:
        await app.state.http.aclose()


app = FastAPI(
    title="NotebookLM Bridge",
    version="0.1.0",
    lifespan=lifespan,
)

if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["POST", "GET", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )


def _pick(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload:
            return payload[key]
    return None


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/ask", response_model=AskResponse, dependencies=[Depends(require_bridge_token)])
async def ask_notebook(body: AskRequest, request: Request) -> AskResponse:
    client: httpx.AsyncClient = request.app.state.http
    upstream_body: dict[str, Any] = {"question": body.question}
    if body.conversation_id:
        upstream_body["conversation_id"] = body.conversation_id

    try:
        upstream = await client.post(
            f"/v1/notebooks/{body.notebook_id}/chat",
            json=upstream_body,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="NotebookLM request timed out") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"NotebookLM server is unavailable: {exc}") from exc

    if upstream.status_code >= 400:
        try:
            detail: Any = upstream.json()
        except ValueError:
            detail = upstream.text
        raise HTTPException(status_code=upstream.status_code, detail=detail)

    payload = upstream.json()
    return AskResponse(
        notebook_id=body.notebook_id,
        answer=_pick(payload, "answer", "text", "response"),
        references=_pick(payload, "references", "sources", "citations"),
        conversation_id=_pick(payload, "conversation_id", "conversationId"),
        raw=payload,
    )
