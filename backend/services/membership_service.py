from __future__ import annotations

import json
import random
from typing import Any

from ..db import Database, get_db
from ..errors import AppError
from ..security import hash_password
from ..time_utils import (
    add_days_to_date_str,
    calculate_age_years,
    compute_membership_status,
    diff_days,
    now_iso,
    to_ist_date_string,
)


def list_plans(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    return db.fetch_all(
        "SELECT * FROM membership_plans WHERE is_active = 1 ORDER BY id ASC"
    )


def sync_membership_statuses(
    db: Database | None = None, today_str: str | None = None
) -> dict[str, Any]:
    db = db or get_db()
    today = today_str or to_ist_date_string()
    updated_count = 0
    notifications_created = 0

    with db.immediate_tx():
        all_members = db.fetch_all("SELECT * FROM members")
        for mem in all_members:
            latest = db.fetch_one(
                "SELECT * FROM memberships WHERE member_id = ? ORDER BY id DESC LIMIT 1",
                (mem["id"],),
            )
            if not latest:
                continue

            computed = compute_membership_status(
                latest["endDate"], latest["status"], today
            )
            if computed != latest["status"] or computed != mem["status"]:
                db.execute(
                    "UPDATE memberships SET status = ? WHERE id = ?",
                    (computed, latest["id"]),
                )
                db.execute(
                    "UPDATE members SET status = ? WHERE id = ?",
                    (computed, mem["id"]),
                )
                updated_count += 1

                if computed in ("EXPIRING_SOON", "EXPIRED"):
                    days_left = diff_days(today, latest["endDate"])
                    title = (
                        f"Membership Expired ({mem['memberCode']})"
                        if computed == "EXPIRED"
                        else f"Membership Expiring in {days_left} Day(s) ({mem['memberCode']})"
                    )
                    status_msg = (
                        "has expired"
                        if computed == "EXPIRED"
                        else f"expires on {latest['endDate']}"
                    )
                    db.execute(
                        """
                        INSERT INTO notifications
                          (target_role, member_id, channel, title, body, is_read, created_at)
                        VALUES (?, ?, ?, ?, ?, 0, ?)
                        """,
                        (
                            "MEMBER",
                            mem["id"],
                            "EMAIL_STUB",
                            title,
                            f"Hi {mem['fullName']}, your Alpha Sports Club membership {status_msg}. Renew online or at the front desk to keep your member rates.",
                            now_iso(),
                        ),
                    )
                    notifications_created += 1

    return {
        "updatedCount": updated_count,
        "notificationsCreated": notifications_created,
        "evaluatedOn": today,
    }


def get_member_with_plan(
    member_id: int, db: Database | None = None, today_str: str | None = None
) -> dict[str, Any]:
    db = db or get_db()
    today = today_str or to_ist_date_string()
    member = db.fetch_one("SELECT * FROM members WHERE id = ?", (member_id,))
    if not member:
        raise AppError(404, "MEMBER_NOT_FOUND", "Member not found.")

    latest_mship = db.fetch_one(
        "SELECT * FROM memberships WHERE member_id = ? ORDER BY id DESC LIMIT 1",
        (member["id"],),
    )
    plan = (
        db.fetch_one(
            "SELECT * FROM membership_plans WHERE id = ?", (latest_mship["planId"],)
        )
        if latest_mship
        else None
    )

    effective_status = (
        compute_membership_status(
            latest_mship["endDate"], latest_mship["status"], today
        )
        if latest_mship
        else member["status"]
    )
    days_to_expiry = (
        diff_days(today, latest_mship["endDate"]) if latest_mship else None
    )

    return {
        **member,
        "status": effective_status,
        "daysToExpiry": days_to_expiry,
        "currentMembership": latest_mship,
        "plan": plan,
    }


def search_members(
    query: str, status_filter: str | None = None, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    q = query.strip()
    if q:
        like_q = f"%{q}%"
        rows = db.fetch_all(
            """
            SELECT id FROM members
            WHERE full_name LIKE ? OR phone LIKE ? OR email LIKE ?
               OR member_code LIKE ? OR qr_token LIKE ?
            ORDER BY id DESC
            """,
            (like_q, like_q, like_q, like_q, like_q),
        )
    else:
        rows = db.fetch_all("SELECT id FROM members ORDER BY id DESC")

    today = to_ist_date_string()
    enriched = [get_member_with_plan(r["id"], db, today) for r in rows]
    if status_filter and status_filter != "ALL":
        return [m for m in enriched if m["status"] == status_filter]
    return enriched


def lookup_member_by_qr_token(
    raw_token: str, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    token = raw_token.strip()
    if not token:
        raise AppError(400, "EMPTY_QR", "Scanned QR code is empty.")

    if token.startswith("{"):
        try:
            parsed = json.loads(token)
            if isinstance(parsed, dict):
                token = str(parsed.get("qrToken") or parsed.get("memberCode") or "").strip()
        except Exception:
            pass

    row = db.fetch_one(
        "SELECT id FROM members WHERE qr_token = ? OR UPPER(member_code) = ?",
        (token, token.upper()),
    )
    if not row:
        raise AppError(
            404,
            "QR_MEMBER_NOT_FOUND",
            f'No member profile found for pass "{token}".',
        )

    return get_member_with_plan(row["id"], db, to_ist_date_string())


def register_member(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    today = to_ist_date_string()
    age = calculate_age_years(data["dob"], today)

    requested_plan = db.fetch_one(
        "SELECT * FROM membership_plans WHERE code = ?",
        (str(data["planCode"]).upper(),),
    )
    if not requested_plan:
        raise AppError(
            400,
            "INVALID_PLAN",
            f"Membership plan '{data['planCode']}' does not exist.",
        )

    # Rule 8: Junior plan enforced for members under 18
    if age < 18 and requested_plan["code"] != "JUNIOR":
        raise AppError(
            400,
            "JUNIOR_PLAN_REQUIRED",
            "Members under 18 years old must be enrolled in the Junior Academy plan.",
        )
    if (
        requested_plan["maxAgeYears"] is not None
        and age > requested_plan["maxAgeYears"]
    ):
        raise AppError(
            400,
            "AGE_EXCEEDS_PLAN",
            f"Junior plan is restricted to members aged {requested_plan['maxAgeYears']} and under.",
        )

    created_at = now_iso()
    billing_cycle = data.get("billingCycle", "ANNUAL")
    duration_days = 365 if billing_cycle == "ANNUAL" else 30
    end_date = add_days_to_date_str(today, duration_days)
    price_paid = (
        requested_plan["annualPricePaise"]
        if billing_cycle == "ANNUAL"
        else requested_plan["monthlyPricePaise"]
    )
    email_norm = str(data["email"]).strip().lower()

    with db.immediate_tx():
        member_role = db.fetch_one(
            "SELECT * FROM roles WHERE name = ?", ("MEMBER",)
        )
        user_id: int | None = None
        if data.get("createLoginPassword") and member_role:
            existing_user = db.fetch_one(
                "SELECT id FROM users WHERE email = ?", (email_norm,)
            )
            if existing_user:
                raise AppError(
                    409,
                    "EMAIL_EXISTS",
                    "A user account with this email already exists.",
                )
            user_row = db.insert_returning(
                """
                INSERT INTO users
                  (email, password_hash, full_name, phone, role_id, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                RETURNING *
                """,
                (
                    email_norm,
                    hash_password(data["createLoginPassword"]),
                    str(data["fullName"]).strip(),
                    str(data["phone"]).strip(),
                    member_role["id"],
                    created_at,
                ),
            )
            user_id = user_row["id"]

        last_mem = db.fetch_one(
            "SELECT id FROM members ORDER BY id DESC LIMIT 1"
        )
        next_num = (last_mem["id"] if last_mem else 0) + 1
        member_code = f"CC-{next_num:05d}"
        qr_token = f"CHAMPIONS-QR-{member_code}-{random.randint(1000, 9999)}"

        member = db.insert_returning(
            """
            INSERT INTO members
              (user_id, member_code, qr_token, full_name, email, phone, dob,
               photo_url, emergency_contact_name, emergency_contact_phone, address,
               status, credit_balance_paise, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?)
            RETURNING *
            """,
            (
                user_id,
                member_code,
                qr_token,
                str(data["fullName"]).strip(),
                email_norm,
                str(data["phone"]).strip(),
                data["dob"],
                data.get("photoUrl"),
                str(data["emergencyContactName"]).strip(),
                str(data["emergencyContactPhone"]).strip(),
                data.get("address"),
                created_at,
            ),
        )

        membership = db.insert_returning(
            """
            INSERT INTO memberships
              (member_id, plan_id, start_date, end_date, status, price_paid_paise, auto_renew, created_at)
            VALUES (?, ?, ?, ?, 'ACTIVE', ?, 0, ?)
            RETURNING *
            """,
            (
                member["id"],
                requested_plan["id"],
                today,
                end_date,
                price_paid,
                created_at,
            ),
        )

        payment_method = data.get("paymentMethod", "CARD")
        staff_user_id = data.get("staffUserId")

        db.execute(
            """
            INSERT INTO payments
              (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
            VALUES ('MEMBERSHIP', ?, ?, ?, ?, 'SUCCESS', ?, ?)
            """,
            (membership["id"], member["id"], price_paid, payment_method, staff_user_id, created_at),
        )

        tax_paise = round((price_paid * 18) / 118)
        db.execute(
            """
            INSERT INTO transactions
              (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
            VALUES ('INCOME', 'MEMBERSHIPS', ?, ?, ?, ?, 'MEMBERSHIP', ?, ?)
            """,
            (
                payment_method,
                price_paid,
                tax_paise,
                f"{requested_plan['name']} ({billing_cycle}) — {member['fullName']} ({member['memberCode']})",
                membership["id"],
                created_at,
            ),
        )

        inv_cnt_row = db.fetch_one("SELECT COUNT(*) AS cnt FROM invoices")
        inv_count = (inv_cnt_row["cnt"] if inv_cnt_row else 0) + 1
        subtotal = price_paid - tax_paise
        inv = db.insert_returning(
            """
            INSERT INTO invoices
              (invoice_number, invoice_type, member_id, issue_date, due_date, status,
               subtotal_paise, tax_paise, total_paise, paid_paise, notes, created_at)
            VALUES (?, 'MEMBERSHIP', ?, ?, ?, 'PAID', ?, ?, ?, ?, 'Paid upon membership registration.', ?)
            RETURNING *
            """,
            (
                f"INV-MEM-{inv_count:04d}",
                member["id"],
                today,
                today,
                subtotal,
                tax_paise,
                price_paid,
                price_paid,
                created_at,
            ),
        )

        db.execute(
            """
            INSERT INTO invoice_items
              (invoice_id, description, quantity, unit_price_paise, tax_rate_pct, line_total_paise)
            VALUES (?, ?, 1, ?, 18, ?)
            """,
            (inv["id"], f"{requested_plan['name']} ({billing_cycle})", subtotal, subtotal),
        )

        db.execute(
            """
            INSERT INTO notifications
              (target_role, member_id, channel, title, body, is_read, created_at)
            VALUES ('MEMBER', ?, 'EMAIL_STUB', ?, ?, 0, ?)
            """,
            (
                member["id"],
                f"Welcome to Alpha Sports Club ({member_code})",
                f"Your {requested_plan['name']} membership is active through {end_date}.",
                created_at,
            ),
        )

        return {
            "userId": user_id,
            "member": get_member_with_plan(member["id"], db, today),
            "membership": membership,
        }


def renew_or_change_plan(
    member_id: int, data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    today = to_ist_date_string()
    member = db.fetch_one("SELECT * FROM members WHERE id = ?", (member_id,))
    if not member:
        raise AppError(404, "MEMBER_NOT_FOUND", "Member not found.")

    age = calculate_age_years(member["dob"], today)
    target_plan = db.fetch_one(
        "SELECT * FROM membership_plans WHERE code = ?",
        (str(data["planCode"]).upper(),),
    )
    if not target_plan:
        raise AppError(400, "INVALID_PLAN", "Invalid membership plan.")
    if age < 18 and target_plan["code"] != "JUNIOR":
        raise AppError(
            400,
            "JUNIOR_PLAN_REQUIRED",
            "Members under 18 must remain on the Junior Academy plan.",
        )
    if (
        target_plan["maxAgeYears"] is not None
        and age > target_plan["maxAgeYears"]
    ):
        raise AppError(
            400,
            "AGE_EXCEEDS_PLAN",
            f"Junior plan is restricted to members aged {target_plan['maxAgeYears']} and under.",
        )

    billing_cycle = data.get("billingCycle", "ANNUAL")
    price_paid = (
        target_plan["annualPricePaise"]
        if billing_cycle == "ANNUAL"
        else target_plan["monthlyPricePaise"]
    )
    duration_days = 365 if billing_cycle == "ANNUAL" else 30
    created_at = now_iso()

    with db.immediate_tx():
        latest = db.fetch_one(
            "SELECT * FROM memberships WHERE member_id = ? ORDER BY id DESC LIMIT 1",
            (member_id,),
        )
        start_base = (
            latest["endDate"] if (latest and latest["endDate"] > today) else today
        )
        end_date = add_days_to_date_str(start_base, duration_days)

        new_mship = db.insert_returning(
            """
            INSERT INTO memberships
              (member_id, plan_id, start_date, end_date, status, price_paid_paise, auto_renew, created_at)
            VALUES (?, ?, ?, ?, 'ACTIVE', ?, 0, ?)
            RETURNING *
            """,
            (member_id, target_plan["id"], today, end_date, price_paid, created_at),
        )

        db.execute(
            "UPDATE members SET status = 'ACTIVE' WHERE id = ?", (member_id,)
        )

        payment_method = data.get("paymentMethod", "CARD")
        actor_user_id = data.get("actorUserId")
        actor_name = data.get("actorName") or "Staff"

        db.execute(
            """
            INSERT INTO payments
              (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
            VALUES ('MEMBERSHIP', ?, ?, ?, ?, 'SUCCESS', ?, ?)
            """,
            (new_mship["id"], member_id, price_paid, payment_method, actor_user_id, created_at),
        )

        tax_paise = round((price_paid * 18) / 118)
        db.execute(
            """
            INSERT INTO transactions
              (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
            VALUES ('INCOME', 'MEMBERSHIPS', ?, ?, ?, ?, 'MEMBERSHIP', ?, ?)
            """,
            (
                payment_method,
                price_paid,
                tax_paise,
                f"Plan Renewal / Change ({target_plan['name']}) — {member['fullName']}",
                new_mship["id"],
                created_at,
            ),
        )

        if actor_user_id:
            db.execute(
                """
                INSERT INTO audit_logs
                  (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
                VALUES (?, ?, 'PLAN_CHANGE', 'MEMBER', ?, ?, ?)
                """,
                (
                    actor_user_id,
                    actor_name,
                    str(member_id),
                    json.dumps({
                        "planCode": target_plan["code"],
                        "billingCycle": billing_cycle,
                        "endDate": end_date,
                    }),
                    created_at,
                ),
            )

        return get_member_with_plan(member_id, db, today)


def update_member_status(
    member_id: int,
    status: str,
    actor_user_id: int | None = None,
    actor_name: str | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    member = db.fetch_one("SELECT * FROM members WHERE id = ?", (member_id,))
    if not member:
        raise AppError(404, "MEMBER_NOT_FOUND", "Member not found.")

    with db.immediate_tx():
        latest = db.fetch_one(
            "SELECT * FROM memberships WHERE member_id = ? ORDER BY id DESC LIMIT 1",
            (member_id,),
        )
        db.execute(
            "UPDATE members SET status = ? WHERE id = ?", (status, member_id)
        )
        if latest:
            db.execute(
                "UPDATE memberships SET status = ? WHERE id = ?",
                (status, latest["id"]),
            )
        db.execute(
            """
            INSERT INTO audit_logs
              (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
            VALUES (?, ?, 'MEMBERSHIP_STATUS_CHANGE', 'MEMBER', ?, ?, ?)
            """,
            (
                actor_user_id,
                actor_name or "Staff",
                str(member_id),
                json.dumps({"from": member["status"], "to": status}),
                now_iso(),
            ),
        )
        return get_member_with_plan(member_id, db)


def get_member_history(
    member_id: int, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    profile = get_member_with_plan(member_id, db)

    member_bookings = db.fetch_all(
        """
        SELECT b.*, c.name AS courtName, c.sport AS sport
        FROM bookings b
        INNER JOIN courts c ON b.court_id = c.id
        WHERE b.member_id = ?
        ORDER BY b.start_ms DESC
        """,
        (member_id,),
    )

    orders = db.fetch_all(
        "SELECT * FROM shop_orders WHERE member_id = ? ORDER BY id DESC",
        (member_id,),
    )
    bar_tabs = db.fetch_all(
        "SELECT * FROM tabs WHERE member_id = ? ORDER BY id DESC", (member_id,)
    )
    member_bar_orders = db.fetch_all(
        "SELECT * FROM bar_orders WHERE member_id = ? ORDER BY id DESC",
        (member_id,),
    )
    member_payments = db.fetch_all(
        "SELECT * FROM payments WHERE member_id = ? ORDER BY id DESC",
        (member_id,),
    )
    member_invoices = db.fetch_all(
        "SELECT * FROM invoices WHERE member_id = ? ORDER BY id DESC",
        (member_id,),
    )

    mship_rows = db.fetch_all(
        """
        SELECT m.*, p.name AS planName, p.code AS planCode
        FROM memberships m
        INNER JOIN membership_plans p ON m.plan_id = p.id
        WHERE m.member_id = ?
        ORDER BY m.id DESC
        """,
        (member_id,),
    )
    formatted_mships = [
        {
            "membership": {k: v for k, v in r.items() if k not in ("planName", "planCode")},
            "planName": r["planName"],
            "planCode": r["planCode"],
        }
        for r in mship_rows
    ]

    return {
        "profile": profile,
        "bookings": member_bookings,
        "shopOrders": orders,
        "tabs": bar_tabs,
        "barOrders": member_bar_orders,
        "payments": member_payments,
        "invoices": member_invoices,
        "memberships": formatted_mships,
    }
