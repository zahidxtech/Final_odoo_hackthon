from __future__ import annotations

import hashlib
import hmac
import secrets
import smtplib
import ssl
import time
from email.message import EmailMessage
from typing import Any

from ..config import get_gmail_address, get_gmail_app_password, get_jwt_secret
from ..db import Database, get_db
from ..errors import AppError
from ..security import sign_token, verify_password
from ..time_utils import calculate_age_years, now_iso, to_ist_date_string
from .membership_service import register_member


OTP_TTL_SECONDS = 10 * 60
OTP_RESEND_DELAY_SECONDS = 60
OTP_HOURLY_REQUEST_LIMIT = 5
OTP_MAX_ATTEMPTS = 5
OTP_GENERIC_RESPONSE = {
    "ok": True,
    "message": (
        "If an account uses that email, a verification code has been sent. "
        "If you requested one recently, check your inbox or wait before retrying."
    ),
}


def _email_otp_hash(email: str, code: str) -> str:
    payload = f"{email}:{code}".encode("utf-8")
    return hmac.new(
        get_jwt_secret().encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()


def _send_login_otp_email(
    email: str, code: str, sender: str, app_password: str
) -> None:
    message = EmailMessage()
    message["Subject"] = "Your Alpha Sports Club verification code"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        f"Your Alpha Sports Club email verification code is {code}.\n\n"
        "It expires in 10 minutes and can only be used once. "
        "If you did not request this code, you can ignore this email."
    )

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            smtp.login(sender, app_password.replace(" ", ""))
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise AppError(
            503,
            "EMAIL_DELIVERY_FAILED",
            "Could not send the sign-in code. Check the Gmail app-password settings and try again.",
        ) from exc


def request_email_login_otp(
    email: str, db: Database | None = None
) -> dict[str, Any]:
    sender = get_gmail_address()
    app_password = get_gmail_app_password()
    if not sender or not app_password:
        raise AppError(
            503,
            "EMAIL_OTP_NOT_CONFIGURED",
            "Email sign-in is not configured on this server.",
        )

    db = db or get_db()
    normalized_email = email.strip().lower()
    user_row = db.fetch_one(
        """
        SELECT u.id FROM users u
        INNER JOIN roles r ON u.role_id = r.id
        WHERE u.email = ? AND u.is_active = 1 AND r.name = 'MEMBER'
        """,
        (normalized_email,),
    )
    if not user_row:
        return OTP_GENERIC_RESPONSE

    now = int(time.time())
    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = _email_otp_hash(normalized_email, code)

    with db.immediate_tx():
        existing = db.fetch_one(
            "SELECT last_sent_at, window_started_at, request_count "
            "FROM email_login_otps WHERE email = ?",
            (normalized_email,),
        )
        if existing and now - existing["lastSentAt"] < OTP_RESEND_DELAY_SECONDS:
            raise AppError(
                429,
                "OTP_RESEND_TOO_SOON",
                "Wait 60 seconds before requesting another verification code.",
            )
        if (
            existing
            and now - existing["windowStartedAt"] < 60 * 60
            and existing["requestCount"] >= OTP_HOURLY_REQUEST_LIMIT
        ):
            raise AppError(
                429,
                "OTP_REQUEST_LIMIT",
                "You have requested too many codes. Try again later.",
            )

        if existing and now - existing["windowStartedAt"] < 60 * 60:
            window_started_at = existing["windowStartedAt"]
            request_count = existing["requestCount"] + 1
            db.execute(
                """
                UPDATE email_login_otps
                SET code_hash = ?, expires_at = ?, attempts = 0, last_sent_at = ?,
                    request_count = ?
                WHERE email = ?
                """,
                (
                    code_hash,
                    now + OTP_TTL_SECONDS,
                    now,
                    request_count,
                    normalized_email,
                ),
            )
        else:
            window_started_at = now
            db.execute(
                """
                INSERT INTO email_login_otps
                  (email, code_hash, expires_at, attempts, last_sent_at,
                   window_started_at, request_count)
                VALUES (?, ?, ?, 0, ?, ?, 1)
                ON CONFLICT(email) DO UPDATE SET
                  code_hash = excluded.code_hash,
                  expires_at = excluded.expires_at,
                  attempts = 0,
                  last_sent_at = excluded.last_sent_at,
                  window_started_at = excluded.window_started_at,
                  request_count = 1
                """,
                (
                    normalized_email,
                    code_hash,
                    now + OTP_TTL_SECONDS,
                    now,
                    window_started_at,
                ),
            )
    try:
        _send_login_otp_email(normalized_email, code, sender, app_password)
    except AppError:
        with db.immediate_tx():
            db.execute(
                "DELETE FROM email_login_otps WHERE email = ? AND code_hash = ?",
                (normalized_email, code_hash),
            )
        raise

    return OTP_GENERIC_RESPONSE


def _build_login_result(user_row: dict[str, Any], db: Database) -> dict[str, Any]:
    member_row = db.fetch_one(
        "SELECT id, member_code FROM members WHERE user_id = ?",
        (user_row["id"],),
    )
    role = user_row["roleName"]
    member_id = member_row["id"] if member_row else None
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
            "memberCode": member_row["memberCode"] if member_row else None,
        },
    }


def verify_email_login_otp(
    email: str, code: str, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    normalized_email = email.strip().lower()
    now = int(time.time())
    error: AppError | None = None
    result: dict[str, Any] | None = None

    with db.immediate_tx():
        otp_row = db.fetch_one(
            "SELECT code_hash, expires_at, attempts FROM email_login_otps WHERE email = ?",
            (normalized_email,),
        )
        if not otp_row:
            error = AppError(401, "INVALID_OTP", "The code is invalid or expired.")
        elif otp_row["expiresAt"] <= now:
            db.execute(
                "DELETE FROM email_login_otps WHERE email = ?", (normalized_email,)
            )
            error = AppError(401, "INVALID_OTP", "The code is invalid or expired.")
        elif otp_row["attempts"] >= OTP_MAX_ATTEMPTS:
            error = AppError(
                429, "OTP_ATTEMPTS_EXCEEDED", "Too many attempts. Request a new code."
            )
        elif not hmac.compare_digest(
            otp_row["codeHash"], _email_otp_hash(normalized_email, code)
        ):
            attempts = otp_row["attempts"] + 1
            db.execute(
                "UPDATE email_login_otps SET attempts = ? WHERE email = ?",
                (attempts, normalized_email),
            )
            if attempts >= OTP_MAX_ATTEMPTS:
                error = AppError(
                    429,
                    "OTP_ATTEMPTS_EXCEEDED",
                    "Too many attempts. Request a new code.",
                )
            else:
                error = AppError(401, "INVALID_OTP", "The code is invalid or expired.")
        else:
            user_row = db.fetch_one(
                """
                SELECT u.id, u.email, u.full_name, u.phone, u.is_active,
                       r.name AS roleName
                FROM users u
                INNER JOIN roles r ON u.role_id = r.id
                WHERE u.email = ?
                """,
                (normalized_email,),
            )
            db.execute(
                "DELETE FROM email_login_otps WHERE email = ?", (normalized_email,)
            )
            if (
                not user_row
                or not user_row["isActive"]
                or user_row["roleName"] != "MEMBER"
            ):
                error = AppError(401, "INVALID_OTP", "The code is invalid or expired.")
            else:
                db.execute(
                    "UPDATE users SET email_verified = 1 WHERE id = ?",
                    (user_row["id"],),
                )
                result = _build_login_result(user_row, db)

    if error:
        raise error
    if not result:
        raise RuntimeError("Email OTP verification completed without a result.")
    return result


def login_user(
    email: str, password: str, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    normalized_email = email.strip().lower()
    user_row = db.fetch_one(
        """
        SELECT u.id, u.email, u.password_hash, u.full_name, u.phone, u.is_active,
               r.name AS roleName
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

    if user_row["roleName"] != "MEMBER":
        return {
            "requiresEmailVerification": False,
            **_build_login_result(user_row, db),
        }

    request_email_login_otp(normalized_email, db)
    return {
        "requiresEmailVerification": True,
        "email": normalized_email,
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
            "emailVerified": False,
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
