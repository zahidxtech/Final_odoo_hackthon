from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

import bcrypt
import jwt
from fastapi import Depends, Request, Response

from .config import get_jwt_secret, is_production
from .errors import AppError

COOKIE_NAME = "cc_token"
VALID_ROLES = frozenset({
    "OWNER",
    "MANAGER",
    "FRONT_DESK",
    "BAR_STAFF",
    "SHOP_STAFF",
    "MEMBER",
})


@dataclass
class AuthUser:
    id: int
    email: str
    fullName: str
    role: str
    memberId: int | None = None


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def sign_token(
    *,
    user_id: int,
    email: str,
    full_name: str,
    role: str,
    member_id: int | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "fullName": full_name,
        "role": role,
        "memberId": member_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=24)).timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


def decode_token(token: str) -> AuthUser:
    decoded = jwt.decode(
        token,
        get_jwt_secret(),
        algorithms=["HS256"],
        options={"verify_sub": False},
    )
    sub_val = decoded.get("sub")
    if sub_val is None:
        raise ValueError("Missing subject")
    return AuthUser(
        id=int(sub_val),
        email=str(decoded["email"]),
        fullName=str(decoded["fullName"]),
        role=str(decoded["role"]),
        memberId=int(decoded["memberId"]) if decoded.get("memberId") is not None else None,
    )


def extract_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    cookie_token = request.cookies.get(COOKIE_NAME)
    return cookie_token or None


def set_auth_cookie(response: Response, token: str) -> None:
    prod = is_production()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="none" if prod else "lax",
        secure=prod,
        max_age=24 * 60 * 60,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    prod = is_production()
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        samesite="none" if prod else "lax",
        secure=prod,
        path="/",
    )


def optional_auth(request: Request) -> AuthUser | None:
    token = extract_token(request)
    if not token:
        return None
    try:
        return decode_token(token)
    except Exception:
        return None


def require_auth(request: Request) -> AuthUser:
    token = extract_token(request)
    if not token:
        raise AppError(401, "UNAUTHORIZED", "Authentication required.")
    try:
        return decode_token(token)
    except Exception:
        raise AppError(401, "INVALID_TOKEN", "Session expired or invalid.")


def require_roles(*allowed_roles: str) -> Callable[[AuthUser], AuthUser]:
    allowed = set(allowed_roles)

    def _dependency(user: AuthUser = Depends(require_auth)) -> AuthUser:
        if user.role not in allowed:
            raise AppError(403, "FORBIDDEN", "Insufficient role permissions for this action.")
        return user

    return _dependency
