"""
auth.py — Verifies the Supabase Auth JWT sent by the frontend, so this
backend never has to touch Supabase itself: it just confirms "this
request came from a logged-in user" and moves on.

This assumes your Supabase project uses the classic HS256 JWT signing
(the "JWT Secret" under Project Settings -> API -> JWT Settings) --
still the default for most projects. If your project has been switched
to the newer per-project asymmetric signing keys, swap this for JWKS
verification instead (PyJWT's PyJWKClient against
https://<project>.supabase.co/auth/v1/.well-known/jwks.json) -- the
call site below (verify_request) doesn't change either way.
"""

from __future__ import annotations

import os

import jwt
from fastapi import Header, HTTPException

SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def verify_request(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(
            token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated"
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    return payload  # payload["sub"] is the Supabase user id, if you ever need it
