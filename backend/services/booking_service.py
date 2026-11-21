from __future__ import annotations

import json
from typing import Any

from ..db import Database, get_db
from ..errors import AppError
from ..time_utils import (
    ist_date_time_to_ms,
    ms_to_ist_hhmm,
    ms_to_ist_iso,
    now_iso,
    now_ms,
    parse_iso_ms,
)
from .membership_service import get_member_with_plan

SLOT_DURATION_MS = 60 * 60 * 1000  # 60 minutes


def calculate_court_quote(
    court: dict[str, Any],
    member_id: int | None,
    start_hhmm: str,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    plan_code = "GUEST"
    discount_pct = 0
    member_name: str | None = None

    hour = int(start_hhmm.split(":")[0])
    is_peak = 17 <= hour < 21

    if member_id:
        m = get_member_with_plan(member_id, db)
        if m["status"] in ("EXPIRED", "FROZEN", "CANCELLED"):
            raise AppError(
                400,
                "MEMBERSHIP_INACTIVE",
                f"Member {m['memberCode']} has {m['status']} membership. Please renew or book as a guest.",
            )
        plan = m.get("plan")
        if plan:
            if hour < plan["allowedStartHour"] or hour + 1 > plan["allowedEndHour"]:
                raise AppError(
                    400,
                    "OUTSIDE_PLAN_HOURS",
                    f"{plan['name']} plan permits bookings between {plan['allowedStartHour']:02d}:00 and {plan['allowedEndHour']:02d}:00.",
                )
            plan_code = plan["code"]
            discount_pct = plan["courtDiscountPct"]
            member_name = m["fullName"]

    peak_setting = db.fetch_one(
        "SELECT value FROM settings WHERE key = ?", ("peak_multiplier_pct",)
    )
    peak_pct = int(peak_setting["value"]) if peak_setting else 120

    base_amount_paise = (
        round((court["hourlyRatePaise"] * peak_pct) / 100)
        if (not member_id and is_peak)
        else court["hourlyRatePaise"]
    )
    discount_amount_paise = round((base_amount_paise * discount_pct) / 100)
    final_amount_paise = max(0, base_amount_paise - discount_amount_paise)

    return {
        "courtId": court["id"],
        "courtName": court["name"],
        "sport": court["sport"],
        "planCode": plan_code,
        "memberName": member_name,
        "isPeak": bool(not member_id and is_peak),
        "baseAmountPaise": base_amount_paise,
        "discountPct": discount_pct,
        "discountAmountPaise": discount_amount_paise,
        "finalAmountPaise": final_amount_paise,
    }


def get_courts(
    sport: str | None = None,
    include_inactive: bool = False,
    db: Database | None = None,
) -> list[dict[str, Any]]:
    db = db or get_db()
    all_courts = db.fetch_all("SELECT * FROM courts ORDER BY id ASC")
    out: list[dict[str, Any]] = []
    for c in all_courts:
        if not include_inactive and not c["isActive"]:
            continue
        if sport and sport != "ALL" and c["sport"] != sport.upper():
            continue
        out.append(c)
    return out


def get_availability_grid(
    date_str: str,
    sport: str | None = None,
    viewer_member_id: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    court_list = get_courts(sport, False, db)
    day_start_ms = ist_date_time_to_ms(date_str, "06:00")
    day_end_ms = ist_date_time_to_ms(date_str, "22:00")

    day_bookings = db.fetch_all(
        "SELECT * FROM bookings WHERE booking_date = ? AND status != 'CANCELLED'",
        (date_str,),
    )
    day_socials = db.fetch_all(
        "SELECT * FROM social_sessions WHERE session_date = ? AND status != 'CANCELLED'",
        (date_str,),
    )
    blocks = db.fetch_all("SELECT * FROM court_blocks")

    slots = [f"{m // 60:02d}:{m % 60:02d}" for m in range(6 * 60, 21 * 60 + 1, 30)]

    social_with_counts: list[dict[str, Any]] = []
    for ss in day_socials:
        joined = db.fetch_all(
            "SELECT * FROM social_participants WHERE session_id = ? AND status = 'JOINED'",
            (ss["id"],),
        )
        social_with_counts.append({
            **ss,
            "joinedCount": len(joined),
            "isViewerJoined": any(
                p["memberId"] == viewer_member_id for p in joined
            )
            if viewer_member_id
            else False,
        })

    grid: list[dict[str, Any]] = []
    for court in court_list:
        court_slots: list[dict[str, Any]] = []
        for hhmm in slots:
            s_ms = ist_date_time_to_ms(date_str, hhmm)
            e_ms = s_ms + SLOT_DURATION_MS

            block = next(
                (
                    b
                    for b in blocks
                    if (b["courtId"] is None or b["courtId"] == court["id"])
                    and s_ms < parse_iso_ms(b["endTime"])
                    and e_ms > parse_iso_ms(b["startTime"])
                ),
                None,
            )
            if block:
                court_slots.append({
                    "time": hhmm,
                    "startMs": s_ms,
                    "endMs": e_ms,
                    "state": "BLOCKED",
                    "reason": block["reason"],
                    "blockType": block["blockType"],
                })
                continue

            social = next(
                (
                    ss
                    for ss in social_with_counts
                    if ss["courtId"] == court["id"]
                    and s_ms < ss["endMs"]
                    and e_ms > ss["startMs"]
                ),
                None,
            )
            if social:
                court_slots.append({
                    "time": hhmm,
                    "startMs": s_ms,
                    "endMs": e_ms,
                    "state": "SOCIAL",
                    "socialSessionId": social["id"],
                    "title": social["title"],
                    "joinedCount": social["joinedCount"],
                    "capacity": social["capacity"],
                    "pricePerHeadPaise": social["pricePerHeadPaise"],
                    "isViewerJoined": social["isViewerJoined"],
                })
                continue

            booking = next(
                (
                    bk
                    for bk in day_bookings
                    if bk["courtId"] == court["id"]
                    and s_ms < bk["endMs"]
                    and e_ms > bk["startMs"]
                ),
                None,
            )
            if booking:
                is_mine = (
                    booking["memberId"] == viewer_member_id
                    if viewer_member_id
                    else False
                )
                court_slots.append({
                    "time": hhmm,
                    "startMs": s_ms,
                    "endMs": e_ms,
                    "state": "MINE" if is_mine else "BOOKED",
                    "bookingId": booking["id"],
                    "bookedStartTime": ms_to_ist_hhmm(booking["startMs"]),
                    "bookedEndTime": ms_to_ist_hhmm(booking["endMs"]),
                    "bookingStatus": booking["status"],
                })
                continue

            court_slots.append({
                "time": hhmm,
                "startMs": s_ms,
                "endMs": e_ms,
                "state": "FREE",
            })

        grid.append({"court": court, "slots": court_slots})

    return {
        "date": date_str,
        "dayStartMs": day_start_ms,
        "dayEndMs": day_end_ms,
        "slotLabels": slots,
        "courts": grid,
        "socialSessions": social_with_counts,
    }


def create_booking(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    start_hhmm = str(data["startTimeHHMM"])
    try:
        hh, mm = [int(p) for p in start_hhmm.split(":")]
    except Exception:
        raise AppError(
            400,
            "INVALID_SLOT",
            "Bookings must start on a 30-minute boundary between 06:00 and 21:00.",
        )
    if mm not in (0, 30) or hh < 6 or hh > 21:
        raise AppError(
            400,
            "INVALID_SLOT",
            "Bookings must start on a 30-minute boundary between 06:00 and 21:00.",
        )

    booking_date = data["bookingDate"]
    start_ms = ist_date_time_to_ms(booking_date, start_hhmm)
    end_ms = start_ms + SLOT_DURATION_MS
    start_iso = ms_to_ist_iso(start_ms)
    end_iso = ms_to_ist_iso(end_ms)

    with db.immediate_tx():
        court = db.fetch_one(
            "SELECT * FROM courts WHERE id = ?", (data["courtId"],)
        )
        if not court or not court["isActive"]:
            raise AppError(404, "COURT_NOT_FOUND", "Court not found or inactive.")

        # 1. Check blocks
        blocks = db.fetch_all("SELECT * FROM court_blocks")
        blocking = next(
            (
                b
                for b in blocks
                if (b["courtId"] is None or b["courtId"] == court["id"])
                and start_ms < parse_iso_ms(b["endTime"])
                and end_ms > parse_iso_ms(b["startTime"])
            ),
            None,
        )
        if blocking:
            raise AppError(
                409,
                "COURT_BLOCKED",
                f"Court unavailable ({blocking['blockType']}): {blocking['reason']}",
            )

        # 2. Check social session conflict
        social_conflict = db.fetch_one(
            """
            SELECT * FROM social_sessions
            WHERE court_id = ? AND status != 'CANCELLED'
              AND start_ms < ? AND end_ms > ?
            LIMIT 1
            """,
            (court["id"], end_ms, start_ms),
        )
        if social_conflict:
            raise AppError(
                409,
                "SOCIAL_SESSION_CONFLICT",
                "This court is reserved for a Social Play session during this time window.",
            )

        # 3. Check exclusive booking overlap
        overlapping = db.fetch_one(
            """
            SELECT * FROM bookings
            WHERE court_id = ? AND status != 'CANCELLED'
              AND start_ms < ? AND end_ms > ?
            LIMIT 1
            """,
            (court["id"], end_ms, start_ms),
        )
        if overlapping:
            raise AppError(
                409,
                "SLOT_CONFLICT",
                f"Court {court['name']} already has a booking overlapping {ms_to_ist_hhmm(overlapping['startMs'])}–{ms_to_ist_hhmm(overlapping['endMs'])}.",
            )

        member_id = data.get("memberId")
        # 4. Member daily booking cap (max 2 active bookings per member per day)
        if member_id:
            max_setting = db.fetch_one(
                "SELECT value FROM settings WHERE key = ?",
                ("max_bookings_per_day",),
            )
            max_per_day = int(max_setting["value"]) if max_setting else 2
            cnt_row = db.fetch_one(
                """
                SELECT COUNT(*) AS cnt FROM bookings
                WHERE member_id = ? AND booking_date = ? AND status != 'CANCELLED'
                """,
                (member_id, booking_date),
            )
            if (cnt_row["cnt"] if cnt_row else 0) >= max_per_day:
                raise AppError(
                    400,
                    "DAILY_BOOKING_LIMIT",
                    f"Daily limit reached: members can hold at most {max_per_day} active court bookings per day.",
                )
        elif not data.get("guestName") or not data.get("guestPhone"):
            raise AppError(
                400,
                "GUEST_DETAILS_REQUIRED",
                "Guest name and phone are required for non-member bookings.",
            )

        # 5. Compute plan pricing
        quote = calculate_court_quote(court, member_id, start_hhmm, db)
        created_at = now_iso()
        pay_method = (
            "FREE"
            if quote["finalAmountPaise"] == 0
            else (data.get("paymentMethod") or "CARD")
        )

        if pay_method == "CREDIT" and member_id and quote["finalAmountPaise"] > 0:
            mem_row = db.fetch_one(
                "SELECT * FROM members WHERE id = ?", (member_id,)
            )
            if not mem_row or mem_row["creditBalancePaise"] < quote["finalAmountPaise"]:
                raise AppError(
                    400, "INSUFFICIENT_CREDIT", "Insufficient member credit balance."
                )
            db.execute(
                "UPDATE members SET credit_balance_paise = ? WHERE id = ?",
                (mem_row["creditBalancePaise"] - quote["finalAmountPaise"], member_id),
            )

        booking_type = data.get("bookingType") or ("MEMBER" if member_id else "WALK_IN")
        actor_user_id = data.get("actorUserId")

        booking = db.insert_returning(
            """
            INSERT INTO bookings
              (court_id, member_id, guest_name, guest_phone, guest_email,
               booking_type, booking_date, start_time, end_time, start_ms, end_ms,
               plan_snapshot_code, base_amount_paise, discount_amount_paise, final_amount_paise,
               status, payment_status, notes, created_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)
            RETURNING *
            """,
            (
                court["id"],
                member_id,
                None if member_id else data.get("guestName"),
                None if member_id else data.get("guestPhone"),
                None if member_id else data.get("guestEmail"),
                booking_type,
                booking_date,
                start_iso,
                end_iso,
                start_ms,
                end_ms,
                quote["planCode"],
                quote["baseAmountPaise"],
                quote["discountAmountPaise"],
                quote["finalAmountPaise"],
                "FREE" if quote["finalAmountPaise"] == 0 else "PAID",
                data.get("notes"),
                actor_user_id,
                created_at,
            ),
        )

        if quote["finalAmountPaise"] > 0:
            db.execute(
                """
                INSERT INTO payments
                  (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                VALUES ('BOOKING', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                """,
                (
                    booking["id"],
                    member_id,
                    quote["finalAmountPaise"],
                    pay_method,
                    actor_user_id,
                    created_at,
                ),
            )
            db.execute(
                """
                INSERT INTO transactions
                  (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                VALUES ('INCOME', 'COURTS', ?, ?, ?, ?, 'BOOKING', ?, ?)
                """,
                (
                    pay_method,
                    quote["finalAmountPaise"],
                    round((quote["finalAmountPaise"] * 18) / 118),
                    f"{court['name']} ({booking_date} {start_hhmm}) — {quote['memberName'] or data.get('guestName')}",
                    booking["id"],
                    created_at,
                ),
            )

        return {
            **booking,
            "courtName": court["name"],
            "sport": court["sport"],
            "quote": quote,
        }


def cancel_booking(
    booking_id: int,
    options: dict[str, Any] | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    opts = options or {}

    with db.immediate_tx():
        booking = db.fetch_one(
            "SELECT * FROM bookings WHERE id = ?", (booking_id,)
        )
        if not booking:
            raise AppError(404, "BOOKING_NOT_FOUND", "Booking not found.")
        if booking["status"] == "CANCELLED":
            raise AppError(400, "ALREADY_CANCELLED", "Booking is already cancelled.")

        if (
            opts.get("actorRole") == "MEMBER"
            and booking["memberId"] != opts.get("actorMemberId")
        ):
            raise AppError(
                403, "FORBIDDEN", "You may only cancel your own court bookings."
            )

        win_setting = db.fetch_one(
            "SELECT value FROM settings WHERE key = ?",
            ("cancellation_window_hours",),
        )
        cancel_window_hours = int(win_setting["value"]) if win_setting else 4
        current_ms = opts.get("nowMs") if opts.get("nowMs") is not None else now_ms()
        hours_before_start = (booking["startMs"] - current_ms) / (60 * 60 * 1000)
        eligible_for_refund = (
            hours_before_start >= cancel_window_hours
            and booking["finalAmountPaise"] > 0
        )
        now_str = now_iso()

        next_payment_status = (
            "REFUNDED" if eligible_for_refund else booking["paymentStatus"]
        )
        db.execute(
            """
            UPDATE bookings
            SET status = 'CANCELLED', payment_status = ?, cancelled_at = ?
            WHERE id = ?
            """,
            (next_payment_status, now_str, booking_id),
        )

        if eligible_for_refund:
            if opts.get("refundAsCredit") and booking["memberId"]:
                mem = db.fetch_one(
                    "SELECT * FROM members WHERE id = ?", (booking["memberId"],)
                )
                if mem:
                    db.execute(
                        "UPDATE members SET credit_balance_paise = ? WHERE id = ?",
                        (
                            mem["creditBalancePaise"] + booking["finalAmountPaise"],
                            mem["id"],
                        ),
                    )
            else:
                db.execute(
                    """
                    INSERT INTO transactions
                      (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                    VALUES ('REFUND', 'COURTS', 'CARD', ?, ?, ?, 'BOOKING', ?, ?)
                    """,
                    (
                        booking["finalAmountPaise"],
                        round((booking["finalAmountPaise"] * 18) / 118),
                        f"Refund for cancelled court booking #{booking['id']}",
                        booking["id"],
                        now_str,
                    ),
                )

        db.execute(
            """
            INSERT INTO audit_logs
              (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
            VALUES (?, ?, 'BOOKING_CANCELLED', 'BOOKING', ?, ?, ?)
            """,
            (
                opts.get("actorUserId"),
                opts.get("actorName") or "User",
                str(booking_id),
                json.dumps({
                    "eligibleForRefund": eligible_for_refund,
                    "hoursBeforeStart": round(hours_before_start, 2),
                }),
                now_str,
            ),
        )

        if eligible_for_refund:
            message = "Booking cancelled with full refund."
        elif booking["finalAmountPaise"] == 0:
            message = "Booking cancelled and slot released."
        else:
            message = f"Cancelled inside {cancel_window_hours}-hour window; no refund issued."

        return {
            "bookingId": booking_id,
            "status": "CANCELLED",
            "eligibleForRefund": eligible_for_refund,
            "refundAmountPaise": booking["finalAmountPaise"] if eligible_for_refund else 0,
            "message": message,
        }


def reschedule_booking(
    booking_id: int,
    new_date: str,
    new_start_hhmm: str,
    new_court_id: int | None = None,
    options: dict[str, Any] | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    opts = options or {}
    existing = db.fetch_one("SELECT * FROM bookings WHERE id = ?", (booking_id,))
    if not existing:
        raise AppError(404, "BOOKING_NOT_FOUND", "Booking not found.")
    if (
        opts.get("actorRole") == "MEMBER"
        and existing["memberId"] != opts.get("actorMemberId")
    ):
        raise AppError(403, "FORBIDDEN", "You may only reschedule your own bookings.")

    with db.immediate_tx():
        cancel_booking(booking_id, {**opts, "refundAsCredit": False}, db)
        base_notes = existing.get("notes")
        new_notes = (
            f"{base_notes} (Rescheduled from #{booking_id})"
            if base_notes
            else f"Rescheduled from #{booking_id}"
        )
        return create_booking(
            {
                "courtId": new_court_id or existing["courtId"],
                "bookingDate": new_date,
                "startTimeHHMM": new_start_hhmm,
                "memberId": existing["memberId"],
                "guestName": existing["guestName"],
                "guestPhone": existing["guestPhone"],
                "guestEmail": existing["guestEmail"],
                "bookingType": existing["bookingType"],
                "paymentMethod": "CARD",
                "notes": new_notes,
                "actorUserId": opts.get("actorUserId"),
            },
            db,
        )


def update_booking_attendance(
    booking_id: int, status: str, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    existing = db.fetch_one("SELECT * FROM bookings WHERE id = ?", (booking_id,))
    if not existing:
        raise AppError(404, "BOOKING_NOT_FOUND", "Booking not found.")
    db.execute("UPDATE bookings SET status = ? WHERE id = ?", (status, booking_id))
    updated = db.fetch_one("SELECT * FROM bookings WHERE id = ?", (booking_id,))
    assert updated is not None
    return updated


def create_social_session(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    dur_ms = (data.get("durationMinutes") or 90) * 60 * 1000
    start_ms = ist_date_time_to_ms(data["sessionDate"], data["startTimeHHMM"])
    end_ms = start_ms + dur_ms

    with db.immediate_tx():
        court = db.fetch_one(
            "SELECT * FROM courts WHERE id = ?", (data["courtId"],)
        )
        if not court:
            raise AppError(404, "COURT_NOT_FOUND", "Court not found.")

        conflict = db.fetch_one(
            """
            SELECT * FROM bookings
            WHERE court_id = ? AND status != 'CANCELLED'
              AND start_ms < ? AND end_ms > ?
            LIMIT 1
            """,
            (court["id"], end_ms, start_ms),
        )
        if conflict:
            raise AppError(
                409,
                "BOOKING_CONFLICT",
                "Cannot schedule a social session over an existing court booking.",
            )

        return db.insert_returning(
            """
            INSERT INTO social_sessions
              (title, court_id, sport, session_date, start_time, end_time, start_ms, end_ms,
               capacity, price_per_head_paise, status, created_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
            RETURNING *
            """,
            (
                data["title"],
                court["id"],
                court["sport"],
                data["sessionDate"],
                ms_to_ist_iso(start_ms),
                ms_to_ist_iso(end_ms),
                start_ms,
                end_ms,
                data["capacity"],
                data["pricePerHeadPaise"],
                data.get("actorUserId"),
                now_iso(),
            ),
        )


def list_social_sessions(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    sessions = db.fetch_all(
        """
        SELECT ss.*, c.name AS courtName
        FROM social_sessions ss
        INNER JOIN courts c ON ss.court_id = c.id
        ORDER BY ss.start_ms DESC
        """
    )
    out: list[dict[str, Any]] = []
    for row in sessions:
        parts = db.fetch_all(
            """
            SELECT sp.*, m.full_name AS memberName, m.member_code AS memberCode
            FROM social_participants sp
            LEFT JOIN members m ON sp.member_id = m.id
            WHERE sp.session_id = ? AND sp.status = 'JOINED'
            """,
            (row["id"],),
        )
        formatted_parts = [
            {
                **{k: v for k, v in p.items() if k != "memberName"},
                "displayName": p.get("memberName") or p.get("guestName") or "Guest",
            }
            for p in parts
        ]
        out.append({
            **row,
            "joinedCount": len(formatted_parts),
            "participants": formatted_parts,
        })
    return out


def join_social_session(
    session_id: int, data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        ss = db.fetch_one(
            "SELECT * FROM social_sessions WHERE id = ?", (session_id,)
        )
        if not ss or ss["status"] == "CANCELLED":
            raise AppError(
                404, "SESSION_NOT_FOUND", "Social session not found or cancelled."
            )

        joined = db.fetch_all(
            "SELECT * FROM social_participants WHERE session_id = ? AND status = 'JOINED'",
            (session_id,),
        )
        if len(joined) >= ss["capacity"]:
            raise AppError(
                409,
                "SESSION_FULL",
                f"Social session is full ({len(joined)}/{ss['capacity']}).",
            )

        member_id = data.get("memberId")
        if member_id and any(p["memberId"] == member_id for p in joined):
            raise AppError(
                409, "ALREADY_JOINED", "Member has already joined this social session."
            )

        if not member_id and (not data.get("guestName") or not data.get("guestPhone")):
            raise AppError(
                400, "GUEST_DETAILS_REQUIRED", "Guest name and phone are required."
            )

        created_at = now_iso()
        method = data.get("paymentMethod") or "UPI"

        participant = db.insert_returning(
            """
            INSERT INTO social_participants
              (session_id, member_id, guest_name, guest_phone, amount_paid_paise, payment_method, status, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, 'JOINED', ?)
            RETURNING *
            """,
            (
                session_id,
                member_id,
                None if member_id else data.get("guestName"),
                None if member_id else data.get("guestPhone"),
                ss["pricePerHeadPaise"],
                method,
                created_at,
            ),
        )

        if len(joined) + 1 >= ss["capacity"]:
            db.execute(
                "UPDATE social_sessions SET status = 'FULL' WHERE id = ?",
                (session_id,),
            )

        db.execute(
            """
            INSERT INTO payments
              (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
            VALUES ('SOCIAL', ?, ?, ?, ?, 'SUCCESS', ?, ?)
            """,
            (
                participant["id"],
                member_id,
                ss["pricePerHeadPaise"],
                method,
                data.get("actorUserId"),
                created_at,
            ),
        )

        db.execute(
            """
            INSERT INTO transactions
              (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
            VALUES ('INCOME', 'COURTS', ?, ?, ?, ?, 'SOCIAL', ?, ?)
            """,
            (
                method,
                ss["pricePerHeadPaise"],
                round((ss["pricePerHeadPaise"] * 18) / 118),
                f"Social Play ({ss['title']})",
                ss["id"],
                created_at,
            ),
        )

        return {
            "participant": participant,
            "joinedCount": len(joined) + 1,
            "capacity": ss["capacity"],
        }


def leave_social_session(
    session_id: int,
    member_id: int,
    now_millis: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        ss = db.fetch_one(
            "SELECT * FROM social_sessions WHERE id = ?", (session_id,)
        )
        if not ss:
            raise AppError(404, "SESSION_NOT_FOUND", "Social session not found.")

        part = db.fetch_one(
            """
            SELECT * FROM social_participants
            WHERE session_id = ? AND member_id = ? AND status = 'JOINED'
            LIMIT 1
            """,
            (session_id, member_id),
        )
        if not part:
            raise AppError(
                404,
                "PARTICIPANT_NOT_FOUND",
                "You are not registered for this session.",
            )

        current_ms = now_millis if now_millis is not None else now_ms()
        hours_before = (ss["startMs"] - current_ms) / (60 * 60 * 1000)
        eligible_for_refund = hours_before >= 4

        db.execute(
            "UPDATE social_participants SET status = 'CANCELLED' WHERE id = ?",
            (part["id"],),
        )
        if ss["status"] == "FULL":
            db.execute(
                "UPDATE social_sessions SET status = 'OPEN' WHERE id = ?",
                (session_id,),
            )

        if eligible_for_refund:
            db.execute(
                """
                INSERT INTO transactions
                  (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                VALUES ('REFUND', 'COURTS', ?, ?, ?, ?, 'SOCIAL', ?, ?)
                """,
                (
                    part["paymentMethod"],
                    part["amountPaidPaise"],
                    round((part["amountPaidPaise"] * 18) / 118),
                    f"Refund for Social Play cancellation ({ss['title']})",
                    ss["id"],
                    now_iso(),
                ),
            )

        return {"left": True, "eligibleForRefund": eligible_for_refund}


def list_bookings(
    filters: dict[str, Any] | None = None, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    f = filters or {}
    rows = db.fetch_all(
        """
        SELECT b.*, c.name AS courtName, c.sport AS sport,
               m.full_name AS memberName, m.member_code AS memberCode
        FROM bookings b
        INNER JOIN courts c ON b.court_id = c.id
        LEFT JOIN members m ON b.member_id = m.id
        ORDER BY b.start_ms DESC
        """
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        if f.get("date") and r["bookingDate"] != f["date"]:
            continue
        if f.get("memberId") is not None and r["memberId"] != f["memberId"]:
            continue
        if f.get("status") and f["status"] != "ALL" and r["status"] != f["status"]:
            continue
        out.append({
            **r,
            "startHHMM": ms_to_ist_hhmm(r["startMs"]),
            "endHHMM": ms_to_ist_hhmm(r["endMs"]),
        })
    return out


def create_court_block(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    s_ms = ist_date_time_to_ms(data["startDate"], data["startHHMM"])
    e_ms = ist_date_time_to_ms(data["endDate"], data["endHHMM"])
    if e_ms <= s_ms:
        raise AppError(
            400, "INVALID_WINDOW", "Block end time must be after start time."
        )
    return db.insert_returning(
        """
        INSERT INTO court_blocks
          (court_id, block_type, reason, start_time, end_time, created_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        """,
        (
            data.get("courtId"),
            data["blockType"],
            data["reason"],
            ms_to_ist_iso(s_ms),
            ms_to_ist_iso(e_ms),
            data.get("actorUserId"),
            now_iso(),
        ),
    )
