"""
main.py — FastAPI app for Render. Deliberately does ONE job: given a list
of yfinance symbols, return current quotes for them, in one batched call,
for a logged-in user of the frontend.

Everything else (auth, watchlists, watchlist items) lives in Supabase and
is talked to directly by the frontend via supabase-js + Row Level
Security -- this backend never touches the database at all.

Run locally:  uvicorn main:app --reload
Deploy on Render: Web Service, build command `pip install -r requirements.txt`,
start command `uvicorn main:app --host 0.0.0.0 --port $PORT`.
Required env vars: SUPABASE_JWT_SECRET, ALLOWED_ORIGIN (your frontend's URL).
"""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth import verify_request
from quotes import fetch_quotes

app = FastAPI(title="Watchlist Price API")

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization", "Content-Type"],
)


class QuotesRequest(BaseModel):
    yf_symbols: list[str] = Field(..., min_length=1, max_length=500)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/quotes")
def quotes(req: QuotesRequest, _user=Depends(verify_request)):
    # De-dupe defensively -- a caller sending duplicates shouldn't cost
    # extra Yahoo load; fetch_quotes still returns rows in the original
    # requested order for the ones actually asked for.
    unique_symbols = list(dict.fromkeys(req.yf_symbols))
    return {"quotes": fetch_quotes(unique_symbols)}
