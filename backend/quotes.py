"""
quotes.py — Batched, rate-limit-safe price fetching. Same strategy as the
original Streamlit app's data_sources.py: ONE yf.download() call for every
symbol in a request, never one call per symbol, plus a short cache so
rapid repeat clicks don't double-hit Yahoo.

This module has no knowledge of Supabase or watchlists at all -- it takes
a list of yf_symbols and returns quotes. The frontend already knows which
symbols are in the active watchlist (it read that from Supabase directly),
so it just sends that list here.
"""

from __future__ import annotations

import threading
import time
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

_CACHE_TTL_S = 20
_cache_lock = threading.Lock()
_cache_store: dict[str, tuple[float, pd.DataFrame]] = {}


def _cache_get(key: str) -> Optional[pd.DataFrame]:
    with _cache_lock:
        item = _cache_store.get(key)
    if item is None:
        return None
    ts, value = item
    if (time.time() - ts) > _CACHE_TTL_S:
        return None
    return value


def _cache_set(key: str, value: pd.DataFrame) -> None:
    with _cache_lock:
        _cache_store[key] = (time.time(), value)


def bulletproof_fetch(fn, *args, retries: int = 3, base_delay: float = 0.6,
                       max_delay: float = 6.0, **kwargs):
    for attempt in range(retries + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001 - deliberate safety net
            if attempt == retries:
                return None
            msg = str(e).lower()
            sleep_s = min(max_delay, base_delay * (2 ** attempt))
            if any(k in msg for k in ("429", "too many requests", "rate limit", "throttle")):
                sleep_s *= 2
            time.sleep(sleep_s)
    return None


def fetch_quotes(yf_symbols: list[str]) -> list[dict]:
    """Returns one dict per requested symbol, in the same order, always --
    missing/failed symbols get status='no_data' rather than being dropped,
    so the frontend never has to guess why a row vanished."""
    if not yf_symbols:
        return []

    cache_key = "quotes:" + ",".join(sorted(yf_symbols))
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached.to_dict("records")

    def _do_fetch():
        return yf.download(
            tickers=yf_symbols, period="5d", interval="1d",
            group_by="ticker", threads=True, progress=False, auto_adjust=False,
        )

    raw = bulletproof_fetch(_do_fetch)

    rows = []
    for sym in yf_symbols:
        row = {
            "yf_symbol": sym, "price": None, "prev_close": None,
            "change": None, "change_pct": None, "day_high": None,
            "day_low": None, "volume": None, "status": "no_data",
        }
        try:
            if raw is not None and not raw.empty:
                try:
                    sub = raw[sym]
                except (KeyError, TypeError):
                    sub = raw  # single-symbol download isn't column-grouped
                sub = sub.dropna(how="all")
                if not sub.empty:
                    last = sub.iloc[-1]
                    prev = sub.iloc[-2] if len(sub) >= 2 else last
                    price = float(last["Close"])
                    prev_close = float(prev["Close"])
                    row.update({
                        "price": price, "prev_close": prev_close,
                        "day_high": float(last["High"]), "day_low": float(last["Low"]),
                        "volume": float(last["Volume"]), "status": "ok",
                        "change": (price - prev_close) if prev_close else None,
                        "change_pct": ((price - prev_close) / prev_close * 100) if prev_close else None,
                    })
        except Exception:
            row["status"] = "error"
        rows.append(row)

    _cache_set(cache_key, pd.DataFrame(rows))
    return rows
