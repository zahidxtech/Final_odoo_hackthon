from __future__ import annotations

from typing import Any

from ..db import Database, get_db
from ..errors import AppError
from ..security import sign_token, verify_password
from ..time_utils import calculate_age_years, now_iso, to_ist_date_string
from .membership_service import register_member


def login_user(
    email: str, password: str, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    normalized_email = email.strip().lower()
    user_row = db.fetch_one(
        """
        SELECT u.id, u.email, u.password_hash, u.full_name, u.phone, u.is_active, r.name AS roleName
        FROM users u
        INNER JOIN roles r ON u.role_id = r.id
        WHERE u.email = ?
        """,
        (normalized_email,),
    )
    if not user_row or not user_row["isActive"]:
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.")

    if not verify_password(password, user_row["passwordHash"]):
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.")

    member_row = db.fetch_one(
        "SELECT id, member_code FROM members WHERE user_id = ?",
        (user_row["id"],),
    )

    role = user_row["roleName"]
    member_id = member_row["id"] if member_row else None
    member_code = member_row["memberCode"] if member_row else None

    token = sign_token(
        user_id=user_row["id"],
        email=user_row["email"],
        full_name=user_row["fullName"],
        role=role,
        member_id=member_id,
    )

    return {
        "token": token,
        "user": {
            "id": user_row["id"],
            "email": user_row["email"],
            "fullName": user_row["fullName"],
            "phone": user_row["phone"],
            "role": role,
            "memberId": member_id,
            "memberCode": member_code,
        },
    }


def register_public_member(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    normalized_email = str(data["email"]).strip().lower()
    existing = db.fetch_one(
        "SELECT id FROM users WHERE email = ?", (normalized_email,)
    )
    if existing:
        raise AppError(
            409, "EMAIL_EXISTS", "An account with this email already exists."
        )

    age = calculate_age_years(data["dob"], to_ist_date_string())
    effective_plan_code = "JUNIOR" if age < 18 else data["planCode"]

    result = register_member(
        {
            "fullName": data["fullName"],
            "email": normalized_email,
            "phone": data["phone"],
            "dob": data["dob"],
            "planCode": effective_plan_code,
            "billingCycle": data.get("billingCycle", "ANNUAL"),
            "emergencyContactName": data["emergencyContactName"],
            "emergencyContactPhone": data["emergencyContactPhone"],
            "paymentMethod": data.get("paymentMethod", "CARD"),
            "createLoginPassword": data["password"],
        },
        db,
    )

    member = result["member"]
    token = sign_token(
        user_id=result["userId"],
        email=normalized_email,
        full_name=data["fullName"],
        role="MEMBER",
        member_id=member["id"],
    )

    return {
        "token": token,
        "user": {
            "id": result["userId"],
            "email": normalized_email,
            "fullName": data["fullName"],
            "phone": data["phone"],
            "role": "MEMBER",
            "memberId": member["id"],
            "memberCode": member["memberCode"],
        },
        "member": member,
    }


def get_current_user_profile(
    user_id: int, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    user_row = db.fetch_one(
        """
        SELECT u.id, u.email, u.full_name, u.phone, u.is_active, r.name AS roleName
        FROM users u
        INNER JOIN roles r ON u.role_id = r.id
        WHERE u.id = ?
        """,
        (user_id,),
    )
    if not user_row:
        raise AppError(404, "NOT_FOUND", "User account not found.")

    member_row = db.fetch_one(
        "SELECT id, member_code FROM members WHERE user_id = ?", (user_row["id"],)
    )

    return {
        "id": user_row["id"],
        "email": user_row["email"],
        "fullName": user_row["fullName"],
        "phone": user_row["phone"],
        "role": user_row["roleName"],
        "memberId": member_row["id"] if member_row else None,
        "memberCode": member_row["memberCode"] if member_row else None,
        "createdAt": now_iso(),
    }
