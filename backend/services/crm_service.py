from __future__ import annotations

from typing import Any

from ..db import Database, get_db
from ..errors import AppError
from ..time_utils import add_days_to_date_str, now_iso, to_ist_date_string
from .membership_service import register_member


def create_lead(data: dict[str, Any], db: Database | None = None) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        created_at = now_iso()
        follow_up_date = add_days_to_date_str(to_ist_date_string(), 1)

        lead = db.insert_returning(
            """
            INSERT INTO leads
              (full_name, email, phone, source, interest, message, status,
               assigned_user_id, follow_up_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?)
            RETURNING *
            """,
            (
                str(data["fullName"]).strip(),
                str(data["email"]).strip().lower(),
                str(data["phone"]).strip(),
                data.get("source", "WEBSITE"),
                data["interest"],
                str(data["message"]).strip(),
                data.get("assignedUserId"),
                follow_up_date,
                created_at,
            ),
        )

        db.execute(
            """
            INSERT INTO notifications
              (target_role, channel, title, body, is_read, created_at)
            VALUES ('FRONT_DESK', 'IN_APP', ?, ?, 0, ?)
            """,
            (
                f"New Enquiry from {lead['fullName']}",
                f"{lead['interest']} via {lead['source']}: \"{lead['message'][:90]}\"",
                created_at,
            ),
        )
        return lead


def list_leads(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    leads = db.fetch_all("SELECT * FROM leads ORDER BY id DESC")
    notes = db.fetch_all("SELECT * FROM lead_notes ORDER BY id DESC")
    quotes = db.fetch_all("SELECT * FROM quotes ORDER BY id DESC")
    users = db.fetch_all("SELECT id, full_name FROM users")
    user_map = {u["id"]: u["fullName"] for u in users}

    notes_by_lead: dict[int, list[dict[str, Any]]] = {}
    for n in notes:
        notes_by_lead.setdefault(n["leadId"], []).append({
            **n,
            "authorName": user_map.get(n["authorUserId"], "Staff")
            if n["authorUserId"]
            else "System",
        })

    quotes_by_lead: dict[int, list[dict[str, Any]]] = {}
    for q in quotes:
        quotes_by_lead.setdefault(q["leadId"], []).append(q)

    return [
        {
            **ld,
            "assignedName": user_map.get(ld["assignedUserId"])
            if ld["assignedUserId"]
            else None,
            "notes": notes_by_lead.get(ld["id"], []),
            "quotes": quotes_by_lead.get(ld["id"], []),
        }
        for ld in leads
    ]


def update_lead(
    lead_id: int, data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    existing = db.fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
    if not existing:
        raise AppError(404, "LEAD_NOT_FOUND", "Lead not found.")

    next_status = data.get("status") or existing["status"]
    next_follow = data.get("followUpDate") or existing["followUpDate"]
    next_assigned = (
        data["assignedUserId"]
        if "assignedUserId" in data
        else existing["assignedUserId"]
    )

    db.execute(
        """
        UPDATE leads
        SET status = ?, follow_up_date = ?, assigned_user_id = ?
        WHERE id = ?
        """,
        (next_status, next_follow, next_assigned, lead_id),
    )
    updated = db.fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
    assert updated is not None
    return updated


def add_lead_note(
    lead_id: int,
    note: str,
    author_user_id: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    existing = db.fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
    if not existing:
        raise AppError(404, "LEAD_NOT_FOUND", "Lead not found.")
    return db.insert_returning(
        """
        INSERT INTO lead_notes (lead_id, author_user_id, note, created_at)
        VALUES (?, ?, ?, ?)
        RETURNING *
        """,
        (lead_id, author_user_id, note.strip(), now_iso()),
    )


def create_quote_for_lead(
    lead_id: int, data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        lead = db.fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
        if not lead:
            raise AppError(404, "LEAD_NOT_FOUND", "Lead not found.")

        plan = db.fetch_one(
            "SELECT * FROM membership_plans WHERE code = ?",
            (str(data["planCode"]).upper(),),
        )
        if not plan:
            raise AppError(400, "INVALID_PLAN", "Invalid membership plan.")

        billing_cycle = data.get("billingCycle", "ANNUAL")
        base = (
            plan["annualPricePaise"]
            if billing_cycle == "ANNUAL"
            else plan["monthlyPricePaise"]
        )
        discount = data.get("discountPaise", 0)
        final_amt = max(0, base - discount)

        cnt_row = db.fetch_one("SELECT COUNT(*) AS cnt FROM quotes")
        count = (cnt_row["cnt"] if cnt_row else 0) + 1
        quote_number = f"QT-2026-{count:03d}"
        valid_until = add_days_to_date_str(to_ist_date_string(), 14)

        quote = db.insert_returning(
            """
            INSERT INTO quotes
              (quote_number, lead_id, plan_id, billing_cycle, quoted_amount_paise,
               discount_paise, final_amount_paise, valid_until, notes, created_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            """,
            (
                quote_number,
                lead_id,
                plan["id"],
                billing_cycle,
                base,
                discount,
                final_amt,
                valid_until,
                data.get("notes"),
                data.get("actorUserId"),
                now_iso(),
            ),
        )

        db.execute(
            "UPDATE leads SET status = 'QUOTE_SENT' WHERE id = ?", (lead_id,)
        )
        return {**quote, "planName": plan["name"], "planCode": plan["code"]}


def convert_lead_to_member(
    lead_id: int, data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        lead = db.fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
        if not lead:
            raise AppError(404, "LEAD_NOT_FOUND", "Lead not found.")
        if lead.get("convertedMemberId"):
            raise AppError(
                409,
                "ALREADY_CONVERTED",
                "Lead has already been converted to a member.",
            )

        reg = register_member(
            {
                "fullName": lead["fullName"],
                "email": lead["email"],
                "phone": lead["phone"],
                "dob": data["dob"],
                "emergencyContactName": data["emergencyContactName"],
                "emergencyContactPhone": data["emergencyContactPhone"],
                "planCode": data["planCode"],
                "billingCycle": data.get("billingCycle", "ANNUAL"),
                "paymentMethod": data.get("paymentMethod", "CARD"),
                "staffUserId": data.get("actorUserId"),
            },
            db,
        )

        db.execute(
            "UPDATE leads SET status = 'WON', converted_member_id = ? WHERE id = ?",
            (reg["member"]["id"], lead_id),
        )
        plan_name = (
            reg["member"]["plan"]["name"] if reg["member"].get("plan") else ""
        )
        db.execute(
            """
            INSERT INTO lead_notes (lead_id, author_user_id, note, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                lead_id,
                data.get("actorUserId"),
                f"Converted to Member {reg['member']['memberCode']} ({plan_name}).",
                now_iso(),
            ),
        )
        return reg
