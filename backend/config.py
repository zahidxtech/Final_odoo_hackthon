from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DIST_DIR = BASE_DIR / "dist"

# Ensure a strong ephemeral fallback if JWT_SECRET is not provided via environment
_RUNTIME_JWT_FALLBACK = secrets.token_hex(32)


def get_jwt_secret() -> str:
    env_secret = os.environ.get("JWT_SECRET", "").strip()
    return env_secret if env_secret else _RUNTIME_JWT_FALLBACK


def get_database_path() -> str:
    return os.environ.get("DATABASE_PATH", str(DATA_DIR / "champions_club.db"))


def is_production() -> bool:
    return os.environ.get("NODE_ENV", "").lower() == "production"


PORT = int(os.environ.get("PORT", "8000"))
TIMEZONE = "Asia/Kolkata"
