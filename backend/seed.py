from __future__ import annotations

import json
import math
import sys
from typing import Any

from .db import Database, get_db, run_migrations
from .security import hash_password
from .time_utils import (
    add_days_to_date_str,
    get_next_friday_date,
    ist_date_time_to_ms,
    ms_to_ist_iso,
    now_iso,
    to_ist_date_string,
)


def _seeded_rand(seed: int):
    state = seed

    def _next() -> float:
        nonlocal state
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296.0

    return _next


def seed_database(db: Database | None = None, *, reset: bool = True) -> None:
    db = db or get_db()
    run_migrations(db)

    if reset:
        db.execute("PRAGMA foreign_keys = OFF;")
        tables = [
            "share_tokens", "settings", "audit_logs", "notifications",
            "quotes", "lead_notes", "leads",
            "payslips", "payroll_runs", "leave_requests", "attendance", "shifts", "employees",
            "expenses", "invoice_items", "invoices", "clients", "transactions", "payments",
            "bar_order_items", "bar_orders", "tabs", "bar_tables", "menu_items",
            "delivery_info", "shop_order_items", "shop_orders", "stock_movements",
            "product_variants", "products", "suppliers",
            "social_participants", "social_sessions", "bookings", "court_blocks", "courts",
            "memberships", "members", "membership_plans", "email_login_otps", "users", "roles",
        ]
        for tbl in tables:
            db.execute(f"DELETE FROM {tbl};")
            db.execute("DELETE FROM sqlite_sequence WHERE name = ?", (tbl,))
        db.execute("PRAGMA foreign_keys = ON;")
    else:
        existing_roles = db.fetch_all("SELECT id FROM roles LIMIT 1")
        if existing_roles:
            return

    rand = _seeded_rand(42026)

    def pick(arr: list[Any]) -> Any:
        return arr[math.floor(rand() * len(arr))]

    today = to_ist_date_string()
    created_at = now_iso()
    password_hash = hash_password("Password@123")

    with db.immediate_tx():
        # 1. Settings
        default_settings = [
            ("club_name", "Alpha Sports Club", "Club display name"),
            ("currency", "INR", "Club billing currency"),
            ("timezone", "Asia/Kolkata", "Club local timezone"),
            ("gst_rate_pct", "18", "Default GST percentage for memberships, shop & corporate invoices"),
            ("bar_gst_pct", "5", "Default GST percentage for cafeteria & bar F&B"),
            ("slot_duration_minutes", "60", "Court booking duration in minutes"),
            ("slot_interval_minutes", "30", "Booking grid interval in minutes"),
            ("max_bookings_per_day", "2", "Max active bookings per member per day"),
            ("cancellation_window_hours", "4", "Hours before start for free cancellation"),
            ("delivery_fee_paise", "10000", "Home delivery fee in paise (₹100)"),
            ("free_delivery_threshold_paise", "250000", "Free delivery threshold in paise (₹2,500)"),
            ("peak_multiplier_pct", "120", "Peak hours multiplier % for walk-in/guest (17:00-21:00)"),
            ("sports_list", "TENNIS,CRICKET,PADEL,BADMINTON", "Configurable club sports"),
        ]
        for k, v, desc in default_settings:
            db.execute(
                "INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)",
                (k, v, desc, created_at),
            )

        # 2. Roles & Demo Users
        role_defs = [
            ("OWNER", "Club owner with full financial, settings & override access"),
            ("MANAGER", "Club manager with HR, CRM, operations & reporting access"),
            ("FRONT_DESK", "Front desk staff for members, bookings & counter POS"),
            ("BAR_STAFF", "Bar & cafeteria staff for tables, KDS & tabs"),
            ("SHOP_STAFF", "Pro shop staff for inventory, restock & order fulfilment"),
            ("MEMBER", "Club member with self-service portal access"),
        ]
        role_map: dict[str, int] = {}
        for rname, rdesc in role_defs:
            row = db.insert_returning(
                "INSERT INTO roles (name, description) VALUES (?, ?) RETURNING id",
                (rname, rdesc),
            )
            role_map[rname] = row["id"]

        demo_users = [
            ("owner@club.com", "Vikramaditya Rao", "+91 98201 10001", "OWNER"),
            ("manager@club.com", "Priya Nair", "+91 98201 10002", "MANAGER"),
            ("frontdesk@club.com", "Rohan Kulkarni", "+91 98201 10003", "FRONT_DESK"),
            ("bar@club.com", "Sandeep Verma", "+91 98201 10004", "BAR_STAFF"),
            ("shop@club.com", "Meera Iyer", "+91 98201 10005", "SHOP_STAFF"),
            ("member@club.com", "Arjun Mehta", "+91 98201 20001", "MEMBER"),
        ]
        user_map: dict[str, int] = {}
        for email, fname, phone, rname in demo_users:
            row = db.insert_returning(
                """
                INSERT INTO users (email, password_hash, full_name, phone, role_id, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                RETURNING id
                """,
                (email, password_hash, fname, phone, role_map[rname], created_at),
            )
            user_map[email] = row["id"]

        # 3. Membership Plans
        plans_data = [
            {
                "code": "GOLD",
                "name": "Gold Premier",
                "description": "Unlimited complimentary court access, priority prime-time slots, and 15% pro shop & lounge privileges.",
                "monthly": 450000,
                "annual": 4500000,
                "courtDisc": 100,
                "shopDisc": 15,
                "barDisc": 15,
                "freeHrs": 999,
                "startHr": 6,
                "endHr": 22,
                "maxAge": None,
            },
            {
                "code": "SILVER",
                "name": "Silver Club",
                "description": "30% off all court bookings across tennis, cricket & padel, plus 10% savings at the pro shop and cafe.",
                "monthly": 250000,
                "annual": 2500000,
                "courtDisc": 30,
                "shopDisc": 10,
                "barDisc": 10,
                "freeHrs": 4,
                "startHr": 6,
                "endHr": 22,
                "maxAge": None,
            },
            {
                "code": "JUNIOR",
                "name": "Junior Academy",
                "description": "For athletes under 18. 50% off daytime & early-evening courts (06:00–18:00) plus 5% gear & nutrition discount.",
                "monthly": 150000,
                "annual": 1500000,
                "courtDisc": 50,
                "shopDisc": 5,
                "barDisc": 5,
                "freeHrs": 6,
                "startHr": 6,
                "endHr": 18,
                "maxAge": 17,
            },
        ]
        plan_map: dict[str, dict[str, Any]] = {}
        for p in plans_data:
            ins = db.insert_returning(
                """
                INSERT INTO membership_plans
                  (code, name, description, monthly_price_paise, annual_price_paise,
                   court_discount_pct, shop_discount_pct, bar_discount_pct,
                   max_bookings_per_day, free_hours_per_month, allowed_start_hour,
                   allowed_end_hour, max_age_years, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, 1)
                RETURNING *
                """,
                (
                    p["code"],
                    p["name"],
                    p["description"],
                    p["monthly"],
                    p["annual"],
                    p["courtDisc"],
                    p["shopDisc"],
                    p["barDisc"],
                    p["freeHrs"],
                    p["startHr"],
                    p["endHr"],
                    p["maxAge"],
                ),
            )
            plan_map[p["code"]] = ins

        # 4. Courts
        courts_data = [
            ("Centre Court 1", "TENNIS", "DecoTurf Acrylic", 120000, 0, "Floodlit championship acrylic hard court with spectator gallery."),
            ("Court 2 — North", "TENNIS", "DecoTurf Acrylic", 120000, 0, "Tournament-spec hard court with LED floodlights."),
            ("Court 3 — Clay", "TENNIS", "Synthetic Red Clay", 100000, 0, "Low-impact synthetic clay surface ideal for baseline rallies."),
            ("Cricket Arena A", "CRICKET", "Hybrid Turf + Bowling Machine", 150000, 1, "Covered high-ceiling lane equipped with automated pace/spin machine."),
            ("Cricket Net B", "CRICKET", "Match-Grade Astro Turf", 120000, 1, "Full run-up indoor cricket practice net with video bay."),
            ("Panoramic Padel 1", "PADEL", "Mondo Supercourt Turf", 140000, 1, "Tempered glass panoramic padel court with climate ventilation."),
        ]
        court_rows: list[dict[str, Any]] = []
        for cname, csport, csurf, crate, cindoor, cdesc in courts_data:
            c = db.insert_returning(
                """
                INSERT INTO courts (name, sport, surface, hourly_rate_paise, is_indoor, is_active, description)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                RETURNING *
                """,
                (cname, csport, csurf, crate, cindoor, cdesc),
            )
            court_rows.append(c)

        tomorrow = add_days_to_date_str(today, 1)
        db.execute(
            """
            INSERT INTO court_blocks (court_id, block_type, reason, start_time, end_time, created_by_user_id, created_at)
            VALUES (?, 'MAINTENANCE', 'Clay line brushing & moisture conditioning', ?, ?, ?, ?)
            """,
            (
                court_rows[2]["id"],
                ms_to_ist_iso(ist_date_time_to_ms(tomorrow, "07:00")),
                ms_to_ist_iso(ist_date_time_to_ms(tomorrow, "09:00")),
                user_map["manager@club.com"],
                created_at,
            ),
        )

        # 5. 60 Members
        first_names = [
            "Arjun", "Ananya", "Kabir", "Diya", "Rohan", "Ishaan", "Tara", "Siddharth",
            "Naina", "Vikram", "Kavya", "Aditya", "Rhea", "Dev", "Sanya", "Nikhil",
            "Maya", "Pranav", "Aarav", "Zoya", "Karan", "Mehek", "Varun", "Shruti",
            "Harsh", "Tanvi", "Yash", "Pooja", "Reyansh", "Aisha",
        ]
        last_names = [
            "Mehta", "Sharma", "Patel", "Kapoor", "Nair", "Desai", "Iyer", "Verma",
            "Reddy", "Joshi", "Malhotra", "Bhatia", "Kulkarni", "Chauhan", "Gupta",
            "Sen", "Rao", "Menon", "Gill", "Bansal",
        ]
        member_rows: list[dict[str, Any]] = []

        for i in range(1, 61):
            is_primary = i == 1
            plan_code = "GOLD" if i <= 20 else ("SILVER" if i <= 45 else "JUNIOR")
            full_name = (
                "Arjun Mehta"
                if is_primary
                else f"{first_names[(i * 3) % len(first_names)]} {last_names[(i * 7) % len(last_names)]}"
            )
            email = (
                "member@club.com"
                if is_primary
                else f"{full_name.lower().replace(' ', '.')}.{i}@example.in"
            )
            phone = (
                "+91 98201 20001"
                if is_primary
                else f"+91 98{str(10000000 + i * 13791)[:8]}"
            )
            dob_year = (2011 + (i % 4)) if plan_code == "JUNIOR" else (1983 + (i % 20))
            dob = f"{dob_year}-{1 + (i % 12):02d}-{1 + (i % 27):02d}"

            end_offset_days = 180 + (i % 150)
            status = "ACTIVE"
            if not is_primary:
                if i % 7 == 0:
                    end_offset_days = 3 + (i % 11)
                    status = "EXPIRING_SOON"
                elif i % 9 == 0:
                    end_offset_days = -(2 + (i % 18))
                    status = "EXPIRED"

            start_date = add_days_to_date_str(today, end_offset_days - 365)
            end_date = add_days_to_date_str(today, end_offset_days)
            member_code = f"CC-{i:05d}"
            qr_token = f"CHAMPIONS-QR-{member_code}-{1000 + i * 17}"

            user_id = user_map["member@club.com"] if is_primary else None
            if not is_primary and i <= 6:
                u = db.insert_returning(
                    """
                    INSERT INTO users (email, password_hash, full_name, phone, role_id, is_active, created_at)
                    VALUES (?, ?, ?, ?, ?, 1, ?)
                    RETURNING id
                    """,
                    (email, password_hash, full_name, phone, role_map["MEMBER"], created_at),
                )
                user_id = u["id"]

            credit = 150000 if i == 1 else (60000 if i % 5 == 0 else 0)
            mem = db.insert_returning(
                """
                INSERT INTO members
                  (user_id, member_code, qr_token, full_name, email, phone, dob, photo_url,
                   emergency_contact_name, emergency_contact_phone, address, status, credit_balance_paise, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    user_id,
                    member_code,
                    qr_token,
                    full_name,
                    email,
                    phone,
                    dob,
                    f"{last_names[(i + 4) % len(last_names)]} Family",
                    f"+91 98111 {str(10000 + i * 211)[:5]}",
                    f"{12 + i} Palm Grove Road, Indiranagar, Bengaluru 560038",
                    status,
                    credit,
                    created_at,
                ),
            )

            plan = plan_map[plan_code]
            mship = db.insert_returning(
                """
                INSERT INTO memberships
                  (member_id, plan_id, start_date, end_date, status, price_paid_paise, auto_renew, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    mem["id"],
                    plan["id"],
                    start_date,
                    end_date,
                    status,
                    plan["annualPricePaise"],
                    1 if i % 3 == 0 else 0,
                    created_at,
                ),
            )

            if i > 48:
                pay_day = add_days_to_date_str(today, -(i - 48) * 2)
                m1 = pick(["CARD", "UPI", "ONLINE"])
                m2 = pick(["CARD", "UPI", "ONLINE"])
                db.execute(
                    """
                    INSERT INTO payments (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                    VALUES ('MEMBERSHIP', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                    """,
                    (mship["id"], mem["id"], plan["annualPricePaise"], m1, user_map["frontdesk@club.com"], f"{pay_day}T11:30:00+05:30"),
                )
                db.execute(
                    """
                    INSERT INTO transactions (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                    VALUES ('INCOME', 'MEMBERSHIPS', ?, ?, ?, ?, 'MEMBERSHIP', ?, ?)
                    """,
                    (
                        m2,
                        plan["annualPricePaise"],
                        round(plan["annualPricePaise"] * 18 / 118),
                        f"{plan['name']} Annual Membership — {full_name} ({member_code})",
                        mship["id"],
                        f"{pay_day}T11:30:00+05:30",
                    ),
                )

            member_rows.append({
                "id": mem["id"],
                "memberCode": member_code,
                "fullName": full_name,
                "planCode": plan_code,
                "status": status,
            })

        # 6. Bookings + Friday Social Sessions
        slot_hours = ["06:00", "07:00", "08:00", "09:00", "10:00", "16:00", "17:00", "18:00", "19:00", "20:00"]
        occupied: set[str] = set()
        booking_count = 0

        next_fri = get_next_friday_date(today)
        friday_dates = [
            add_days_to_date_str(next_fri, -28),
            add_days_to_date_str(next_fri, -21),
            add_days_to_date_str(next_fri, -14),
            add_days_to_date_str(next_fri, -7),
            next_fri,
            add_days_to_date_str(next_fri, 7),
        ]

        for fri_date in friday_dates:
            social_court = court_rows[0]
            start_ms = ist_date_time_to_ms(fri_date, "19:00")
            end_ms = start_ms + 90 * 60 * 1000
            ss = db.insert_returning(
                """
                INSERT INTO social_sessions
                  (title, court_id, sport, session_date, start_time, end_time, start_ms, end_ms,
                   capacity, price_per_head_paise, status, created_by_user_id, created_at)
                VALUES ('Friday Night Floodlight Social Mixer', ?, ?, ?, ?, ?, ?, ?, 8, 40000, ?, ?, ?)
                RETURNING *
                """,
                (
                    social_court["id"],
                    social_court["sport"],
                    fri_date,
                    ms_to_ist_iso(start_ms),
                    ms_to_ist_iso(end_ms),
                    start_ms,
                    end_ms,
                    "COMPLETED" if fri_date < today else "OPEN",
                    user_map["manager@club.com"],
                    created_at,
                ),
            )
            occupied.add(f"{social_court['id']}|{fri_date}|19:00")
            occupied.add(f"{social_court['id']}|{fri_date}|20:00")

            num_joiners = 5 if fri_date >= today else (6 + math.floor(rand() * 3))
            for j in range(num_joiners):
                m = member_rows[(j * 5 + 1) % 45]
                part = db.insert_returning(
                    """
                    INSERT INTO social_participants (session_id, member_id, amount_paid_paise, payment_method, status, joined_at)
                    VALUES (?, ?, 40000, ?, 'JOINED', ?)
                    RETURNING id
                    """,
                    (ss["id"], m["id"], pick(["UPI", "CARD"]), f"{fri_date}T14:00:00+05:30"),
                )
                db.execute(
                    """
                    INSERT INTO payments (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                    VALUES ('SOCIAL', ?, ?, 40000, 'UPI', 'SUCCESS', ?, ?)
                    """,
                    (part["id"], m["id"], user_map["frontdesk@club.com"], f"{fri_date}T14:00:00+05:30"),
                )
                db.execute(
                    """
                    INSERT INTO transactions (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                    VALUES ('INCOME', 'COURTS', 'UPI', 40000, ?, ?, 'SOCIAL', ?, ?)
                    """,
                    (
                        round(40000 * 18 / 118),
                        f"Friday Social Play — {m['fullName']}",
                        ss["id"],
                        f"{fri_date}T14:00:00+05:30",
                    ),
                )

        arjun = member_rows[0]
        arjun_today_start = ist_date_time_to_ms(today, "18:00")
        occupied.add(f"{court_rows[0]['id']}|{today}|18:00")
        db.execute(
            """
            INSERT INTO bookings
              (court_id, member_id, booking_type, booking_date, start_time, end_time, start_ms, end_ms,
               plan_snapshot_code, base_amount_paise, discount_amount_paise, final_amount_paise,
               status, payment_status, notes, created_by_user_id, created_at)
            VALUES (?, ?, 'MEMBER', ?, ?, ?, ?, ?, 'GOLD', ?, ?, 0, 'CONFIRMED', 'FREE', 'Evening singles practice', ?, ?)
            """,
            (
                court_rows[0]["id"],
                arjun["id"],
                today,
                ms_to_ist_iso(arjun_today_start),
                ms_to_ist_iso(arjun_today_start + 3600000),
                arjun_today_start,
                arjun_today_start + 3600000,
                court_rows[0]["hourlyRatePaise"],
                court_rows[0]["hourlyRatePaise"],
                user_map["member@club.com"],
                created_at,
            ),
        )
        booking_count += 1

        arjun_tom_start = ist_date_time_to_ms(tomorrow, "08:00")
        occupied.add(f"{court_rows[5]['id']}|{tomorrow}|08:00")
        db.execute(
            """
            INSERT INTO bookings
              (court_id, member_id, booking_type, booking_date, start_time, end_time, start_ms, end_ms,
               plan_snapshot_code, base_amount_paise, discount_amount_paise, final_amount_paise,
               status, payment_status, notes, created_by_user_id, created_at)
            VALUES (?, ?, 'MEMBER', ?, ?, ?, ?, ?, 'GOLD', ?, ?, 0, 'CONFIRMED', 'FREE', 'Padel doubles', ?, ?)
            """,
            (
                court_rows[5]["id"],
                arjun["id"],
                tomorrow,
                ms_to_ist_iso(arjun_tom_start),
                ms_to_ist_iso(arjun_tom_start + 3600000),
                arjun_tom_start,
                arjun_tom_start + 3600000,
                court_rows[5]["hourlyRatePaise"],
                court_rows[5]["hourlyRatePaise"],
                user_map["member@club.com"],
                created_at,
            ),
        )
        booking_count += 1

        active_members = [m for m in member_rows if m["status"] != "EXPIRED"]
        for day_offset in range(-42, 11):
            b_date = add_days_to_date_str(today, day_offset)
            num_for_day = 8 if day_offset == 0 else (5 if day_offset < 0 else 4)
            placed = 0
            attempts = 0
            while placed < num_for_day and attempts < 40:
                attempts += 1
                court = pick(court_rows)
                slot = pick(slot_hours)
                key = f"{court['id']}|{b_date}|{slot}"
                if key in occupied:
                    continue

                is_guest = rand() < 0.22
                member = None if is_guest else pick(active_members)
                if member and member["planCode"] == "JUNIOR" and int(slot[:2]) >= 18:
                    continue

                start_ms = ist_date_time_to_ms(b_date, slot)
                end_ms = start_ms + 3600000
                plan = plan_map[member["planCode"]] if member else None
                discount_pct = plan["courtDiscountPct"] if plan else 0
                base = court["hourlyRatePaise"]
                disc = round((base * discount_pct) / 100)
                final_amt = base - disc

                b_status = "CONFIRMED"
                pay_status = "FREE" if final_amt == 0 else "PAID"
                if day_offset < 0:
                    r = rand()
                    if r < 0.1:
                        b_status = "CANCELLED"
                        pay_status = "FREE" if final_amt == 0 else "REFUNDED"
                    elif r < 0.16:
                        b_status = "NO_SHOW"
                    else:
                        b_status = "COMPLETED"
                elif day_offset == 0 and int(slot[:2]) < 12:
                    b_status = "CHECKED_IN"

                if b_status != "CANCELLED":
                    occupied.add(key)

                ins = db.insert_returning(
                    """
                    INSERT INTO bookings
                      (court_id, member_id, guest_name, guest_phone, booking_type, booking_date,
                       start_time, end_time, start_ms, end_ms, plan_snapshot_code,
                       base_amount_paise, discount_amount_paise, final_amount_paise,
                       status, payment_status, created_by_user_id, cancelled_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING id
                    """,
                    (
                        court["id"],
                        member["id"] if member else None,
                        f"Guest {first_names[attempts % len(first_names)]} {last_names[placed % len(last_names)]}" if is_guest else None,
                        f"+91 99000 {str(10000 + booking_count * 73)[:5]}" if is_guest else None,
                        ("WALK_IN" if rand() < 0.5 else "TRIAL") if is_guest else "MEMBER",
                        b_date,
                        ms_to_ist_iso(start_ms),
                        ms_to_ist_iso(end_ms),
                        start_ms,
                        end_ms,
                        plan["code"] if plan else "GUEST",
                        base,
                        disc,
                        final_amt,
                        b_status,
                        pay_status,
                        user_map["frontdesk@club.com"],
                        f"{b_date}T08:00:00+05:30" if b_status == "CANCELLED" else None,
                        f"{b_date}T07:00:00+05:30",
                    ),
                )

                if final_amt > 0 and b_status != "CANCELLED":
                    method = pick(["CARD", "UPI", "CASH"])
                    db.execute(
                        """
                        INSERT INTO payments (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                        VALUES ('BOOKING', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                        """,
                        (ins["id"], member["id"] if member else None, final_amt, method, user_map["frontdesk@club.com"], f"{b_date}T{slot}:00+05:30"),
                    )
                    db.execute(
                        """
                        INSERT INTO transactions (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                        VALUES ('INCOME', 'COURTS', ?, ?, ?, ?, 'BOOKING', ?, ?)
                        """,
                        (
                            method,
                            final_amt,
                            round((final_amt * 18) / 118),
                            f"{court['name']} ({slot}) — {member['fullName'] if member else 'Walk-in Guest'}",
                            ins["id"],
                            f"{b_date}T{slot}:00+05:30",
                        ),
                    )
                booking_count += 1
                placed += 1

        # 7. Suppliers & 40 Shop Products + Variants + 120 Orders
        suppliers_data = [
            ("ProAce Racquet Sports India", "Rajesh Khanna", "+91 98450 11223", "orders@proace.in", "MG Road, Bengaluru"),
            ("CricketWorks Equipment Co.", "Sunil Gavaskar", "+91 98450 33445", "supply@cricketworks.in", "Dadar West, Mumbai"),
            ("CourtStride Athletic Footwear", "Neha Oberoi", "+91 98450 55667", "b2b@courtstride.in", "Sector 18, Gurugram"),
            ("Apex Apparel & Accessories", "Varun Dhawan", "+91 98450 77889", "sales@apexapparel.in", "Tiruppur Industrial Estate"),
        ]
        supplier_rows = [
            db.insert_returning(
                "INSERT INTO suppliers (name, contact_name, phone, email, address) VALUES (?, ?, ?, ?, ?) RETURNING id",
                s,
            )
            for s in suppliers_data
        ]

        catalog_seed = [
            ("Pro Staff v14 Carbon Racket", "RACKETS", "Wilson", 1850000, 1200000, ["Grip L2", "Grip L3"], False),
            ("Pure Aero Spin Tennis Frame", "RACKETS", "Babolat", 1720000, 1120000, ["Grip L2", "Grip L3"], False),
            ("Speed MP Graphene Racket", "RACKETS", "Head", 1650000, 1080000, ["Grip L2"], False),
            ("Vertex 04 Pro Padel Bat", "RACKETS", "Bullpadel", 1950000, 1280000, ["365g"], False),
            ("AT10 Genius Padel Racket", "RACKETS", "Nox", 1790000, 1180000, ["370g"], True),
            ("Astrox 99 Badminton Frame", "RACKETS", "Yonex", 1420000, 920000, ["4U G5"], False),
            ('Junior Pro 25" Tennis Racket', "RACKETS", "Wilson", 540000, 340000, ["25 inch"], False),
            ("English Willow Grade-A Cricket Bat", "RACKETS", "SG", 2250000, 1500000, ["Short Handle"], False),
            ("Tour Championship Tennis Balls (4-Can)", "BALLS", "Head", 65000, 40000, ["4-Ball Can"], True),
            ("US Open Extra Duty Ball Case (18 Cans)", "BALLS", "Wilson", 980000, 640000, ["Case of 18"], False),
            ("Pro S Padel Balls (3-Can)", "BALLS", "Bullpadel", 59000, 36000, ["3-Ball Can"], False),
            ("4-Piece Leather Match Cricket Ball", "BALLS", "Kookaburra", 145000, 90000, ["156g Red", "156g White"], False),
            ("Aerosensa 50 Feather Shuttlecocks (12)", "BALLS", "Yonex", 240000, 160000, ["Speed 77"], True),
            ("Practice Pressureless Tennis Bucket (60)", "BALLS", "Babolat", 520000, 330000, ["60 Balls"], False),
            ("Indoor Cricket Soft Training Balls (6)", "BALLS", "Gray-Nicolls", 95000, 58000, ["Pack of 6"], False),
        ]

        variant_rows: list[dict[str, Any]] = []
        product_images = {
            "Pro Staff v14 Carbon Racket": "/src/assets/images/products/alpha-tennis-racket-yellow.webp",
            "Pure Aero Spin Tennis Frame": "/src/assets/images/products/alpha-tennis-racket-black.webp",
            "Speed MP Graphene Racket": "/src/assets/images/products/alpha-tennis-racket-yellow-alt.png",
            "Vertex 04 Pro Padel Bat": "/src/assets/images/products/alpha-padel-racket-red.webp",
            "AT10 Genius Padel Racket": "/src/assets/images/products/alpha-padel-racket-nox.webp",
            "Astrox 99 Badminton Frame": "/src/assets/images/products/alpha-badminton-racket-red.webp",
            'Junior Pro 25" Tennis Racket': "/src/assets/images/products/alpha-tennis-racket-black-alt.png",
            "English Willow Grade-A Cricket Bat": "/src/assets/images/products/alpha-cricket-bat.webp",
            "Tour Championship Tennis Balls (4-Can)": "/src/assets/images/products/alpha-tennis-balls-4-can.webp",
            "US Open Extra Duty Ball Case (18 Cans)": "/src/assets/images/products/alpha-tennis-ball-case.webp",
            "Pro S Padel Balls (3-Can)": "/src/assets/images/products/alpha-tennis-balls-can.webp",
            "4-Piece Leather Match Cricket Ball": "/src/assets/images/products/alpha-cricket-match-ball.webp",
            "Aerosensa 50 Feather Shuttlecocks (12)": "/src/assets/images/products/alpha-badminton-shuttle-tube.webp",
            "Practice Pressureless Tennis Bucket (60)": "/src/assets/images/products/alpha-tennis-balls-bucket.webp",
            "Indoor Cricket Soft Training Balls (6)": "/src/assets/images/products/alpha-cricket-soft-balls-box.webp",
        }
        for idx, (pname, pcat, pbrand, pprice, pcost, psizes, low_stock) in enumerate(catalog_seed):
            sku = f"CC-{pcat[:3]}-{idx + 1:03d}"
            image_url = product_images.get(pname, "/src/assets/images/shop_pro_gear_1795254057097.jpg")
            prod = db.insert_returning(
                """
                INSERT INTO products
                  (name, sku, category, brand, description, image_url, price_paise, cost_price_paise, reorder_level, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 6, 1, ?)
                RETURNING *
                """,
                (
                    pname,
                    sku,
                    pcat,
                    pbrand,
                    f"Tournament-grade {pbrand} {pname.lower()} engineered for club performance.",
                    image_url,
                    pprice,
                    pcost,
                    created_at,
                ),
            )
            color = "Navy / Lime" if idx % 2 == 0 else "Graphite"
            for s_idx, sz in enumerate(psizes):
                v_sku = f"{sku}-{s_idx + 1}"
                stock = (3 if s_idx == 0 else 5) if low_stock else (18 + ((idx + s_idx) % 24))
                v = db.insert_returning(
                    """
                    INSERT INTO product_variants (product_id, sku, size, color, stock_qty)
                    VALUES (?, ?, ?, ?, ?)
                    RETURNING *
                    """,
                    (prod["id"], v_sku, sz, color, stock),
                )
                db.execute(
                    """
                    INSERT INTO stock_movements
                      (variant_id, supplier_id, movement_type, quantity_delta, unit_cost_paise, reference_type, reference_id, reason, created_by_user_id, created_at)
                    VALUES (?, ?, 'RESTOCK', ?, ?, 'PURCHASE', ?, 'Opening inventory stock', ?, ?)
                    """,
                    (
                        v["id"],
                        supplier_rows[idx % len(supplier_rows)]["id"],
                        stock,
                        pcost,
                        idx + 1,
                        user_map["shop@club.com"],
                        created_at,
                    ),
                )
                variant_rows.append({
                    "id": v["id"],
                    "productId": prod["id"],
                    "name": pname,
                    "label": f"{sz} · {color}",
                    "pricePaise": pprice,
                    "stockQty": stock,
                })

        order_statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "READY", "OUT_FOR_DELIVERY", "CONFIRMED", "PLACED", "CANCELLED"]
        for o in range(1, 121):
            day_ago = (o * 42) // 120
            o_date = add_days_to_date_str(today, -day_ago)
            is_online = o % 3 != 0
            fulfilment = "COUNTER" if not is_online else ("PICKUP" if o % 2 == 0 else "DELIVERY")
            member = None if o % 4 == 0 else member_rows[o % 45]
            v1 = variant_rows[(o * 3) % len(variant_rows)]
            qty = 1 + (o % 2)
            subtotal = v1["pricePaise"] * qty
            plan_disc = plan_map[member["planCode"]]["shopDiscountPct"] if member else 0
            disc = round((subtotal * plan_disc) / 100)
            deliv_fee = 10000 if (fulfilment == "DELIVERY" and (subtotal - disc) < 250000) else 0
            taxable = subtotal - disc
            tax = round((taxable * 18) / 118)
            total = taxable + deliv_fee
            status = ("CANCELLED" if o % 15 == 0 else "COMPLETED") if day_ago > 3 else order_statuses[o % len(order_statuses)]
            method = pick(["CARD", "UPI", "ONLINE"]) if is_online else pick(["CASH", "CARD", "UPI"])

            ord_row = db.insert_returning(
                """
                INSERT INTO shop_orders
                  (order_number, member_id, customer_name, customer_phone, customer_email,
                   channel, fulfilment_type, status, subtotal_paise, discount_paise,
                   delivery_fee_paise, tax_paise, total_paise, payment_method, created_by_user_id, created_at)
                VALUES (?, ?, ?, '+91 98201 55443', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    f"ORD-{1000 + o}",
                    member["id"] if member else None,
                    member["fullName"] if member else f"Walk-in Shopper {o}",
                    f"{member['memberCode'].lower()}@example.in" if member else None,
                    "ONLINE" if is_online else "POS",
                    fulfilment,
                    status,
                    subtotal,
                    disc,
                    deliv_fee,
                    tax,
                    total,
                    method,
                    None if is_online else user_map["shop@club.com"],
                    f"{o_date}T15:20:00+05:30",
                ),
            )
            db.execute(
                """
                INSERT INTO shop_order_items (order_id, variant_id, product_name, variant_label, quantity, unit_price_paise, line_total_paise)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (ord_row["id"], v1["id"], v1["name"], v1["label"], qty, v1["pricePaise"], subtotal),
            )
            if fulfilment == "DELIVERY":
                db.execute(
                    """
                    INSERT INTO delivery_info (order_id, address_line, city, postal_code, delivery_notes, courier_name, tracking_code)
                    VALUES (?, ?, 'Bengaluru', '560008', 'Leave at security gate', 'BlueDart Express', ?)
                    """,
                    (ord_row["id"], f"{40 + o} 12th Main, HAL 2nd Stage", f"BD{900100 + o}"),
                )
            if status != "CANCELLED":
                db.execute(
                    """
                    INSERT INTO payments (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                    VALUES ('SHOP_ORDER', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                    """,
                    (ord_row["id"], member["id"] if member else None, total, method, user_map["shop@club.com"], f"{o_date}T15:20:00+05:30"),
                )
                db.execute(
                    """
                    INSERT INTO transactions (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                    VALUES ('INCOME', 'SHOP', ?, ?, ?, ?, 'SHOP_ORDER', ?, ?)
                    """,
                    (method, total, tax, f"Pro Shop {ord_row['orderNumber']} ({ord_row['channel']})", ord_row["id"], f"{o_date}T15:20:00+05:30"),
                )

        # 8. Bar Menu, Tables, Open Tabs, Bar Orders
        menu_seed = [
            ("Double Shot Espresso", "DRINKS", 18000, 3),
            ("Iced Matcha Oat Latte", "DRINKS", 29000, 4),
            ("Green Recovery Smoothie", "DRINKS", 32000, 5),
            ("Whey Isolate Berry Shake", "DRINKS", 36000, 4),
            ("Fresh Watermelon Mint Cooler", "DRINKS", 21000, 4),
            ("Electrolyte Lime Spritz", "DRINKS", 16000, 2),
            ("Cold Brew Tonic", "DRINKS", 26000, 3),
            ("Fresh Tender Coconut Water", "DRINKS", 14000, 2),
            ("Artisan Masala Chai", "DRINKS", 15000, 5),
            ("Valencia Orange Cold-Press", "DRINKS", 25000, 4),
            ("Craft Ginger Kombucha", "DRINKS", 28000, 2),
            ("Belgian Chocolate Malt", "DRINKS", 29000, 5),
            ("Sparkling Mineral Water 750ml", "DRINKS", 19000, 1),
            ("Zero-Proof Citrus Mojito", "DRINKS", 24000, 4),
            ("Avocado & Chilli Sourdough Toast", "SNACKS", 38000, 8),
            ("Peri-Peri Baked Sweet Potato Fries", "SNACKS", 26000, 10),
            ("Hummus, Zaatar & Pita Platter", "SNACKS", 34000, 6),
            ("Roasted Almond & Date Energy Bites", "SNACKS", 22000, 2),
            ("Tandoori Paneer Skewers", "SNACKS", 42000, 12),
            ("Crispy Edamame Sea Salt", "SNACKS", 28000, 6),
            ("Smoked Chicken Crostini", "SNACKS", 39000, 9),
            ("Classic Margherita Flatbread", "SNACKS", 44000, 12),
            ("Peanut Butter Banana Toast", "SNACKS", 24000, 5),
            ("Grilled Chicken Quinoa Power Bowl", "MEALS", 54000, 14),
            ("Chargrilled Halloumi & Farro Salad", "MEALS", 49000, 12),
            ("Clubhouse Triple-Decker Sandwich", "MEALS", 48000, 12),
            ("Pesto Burrata Panini", "MEALS", 46000, 10),
            ("Teriyaki Salmon Poke Bowl", "MEALS", 68000, 14),
            ("Herb Roasted Chicken & Mash", "MEALS", 59000, 16),
            ("Spiced Chickpea & Tahini Wrap", "MEALS", 39000, 9),
            ("Three-Egg Masala Omelette Plate", "MEALS", 32000, 10),
            ("Acai Granola Berry Bowl", "DESSERTS", 41000, 6),
            ("Dark Chocolate Protein Brownie", "DESSERTS", 25000, 3),
            ("Greek Yogurt & Honey Parfait", "DESSERTS", 29000, 4),
            ("Classic Tiramisu Jar", "DESSERTS", 34000, 3),
        ]
        menu_rows = [
            db.insert_returning(
                """
                INSERT INTO menu_items (name, category, description, price_paise, tax_rate_pct, is_available, prep_minutes)
                VALUES (?, ?, 'Freshly prepared at the Clubhouse Kitchen.', ?, 5, 1, ?)
                RETURNING *
                """,
                (mname, mcat, mprice, mprep),
            )
            for mname, mcat, mprice, mprep in menu_seed
        ]

        table_rows: list[dict[str, Any]] = []
        for t in range(1, 11):
            zone = "Courtside Deck" if t <= 4 else ("Club Lounge" if t <= 8 else "Terrace")
            t_status = "OCCUPIED" if t <= 2 else ("AWAITING_BILL" if t == 3 else "FREE")
            cur_mem = arjun["id"] if t == 1 else (member_rows[2]["id"] if t == 2 else (member_rows[4]["id"] if t == 3 else None))
            tbl = db.insert_returning(
                """
                INSERT INTO bar_tables (table_number, zone, seats, status, current_member_id, opened_at)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    f"T-{t:02d}",
                    zone,
                    6 if t % 3 == 0 else 4,
                    t_status,
                    cur_mem,
                    f"{today}T16:30:00+05:30" if t <= 3 else None,
                ),
            )
            table_rows.append(tbl)

        open_tab_members = [arjun, member_rows[2], member_rows[4]]
        for idx, m in enumerate(open_tab_members):
            item1 = menu_rows[idx * 3]
            item2 = menu_rows[idx * 3 + 15]
            sub = item1["pricePaise"] + item2["pricePaise"]
            disc_pct = plan_map[m["planCode"]]["barDiscountPct"]
            disc = round((sub * disc_pct) / 100)
            tax = round(((sub - disc) * 5) / 100)
            total = sub - disc + tax

            tab = db.insert_returning(
                """
                INSERT INTO tabs (member_id, status, subtotal_paise, discount_paise, tax_paise, total_paise, paid_paise, opened_at)
                VALUES (?, 'OPEN', ?, ?, ?, ?, 0, ?)
                RETURNING *
                """,
                (m["id"], sub, disc, tax, total, f"{today}T16:35:00+05:30"),
            )
            kds_st = "PREPARING" if idx == 0 else ("NEW" if idx == 1 else "READY")
            bo = db.insert_returning(
                """
                INSERT INTO bar_orders
                  (order_number, table_id, member_id, tab_id, staff_user_id, kds_status, billing_status,
                   subtotal_paise, discount_paise, tax_paise, total_paise, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'ON_TAB', ?, ?, ?, ?, 'No ice in drinks', ?)
                RETURNING *
                """,
                (
                    f"BAR-LIVE-{idx + 1}",
                    table_rows[idx]["id"],
                    m["id"],
                    tab["id"],
                    user_map["bar@club.com"],
                    kds_st,
                    sub,
                    disc,
                    tax,
                    total,
                    f"{today}T16:40:00+05:30",
                ),
            )
            for it in (item1, item2):
                db.execute(
                    """
                    INSERT INTO bar_order_items (bar_order_id, menu_item_id, item_name, quantity, unit_price_paise, line_total_paise)
                    VALUES (?, ?, ?, 1, ?, ?)
                    """,
                    (bo["id"], it["id"], it["name"], it["pricePaise"], it["pricePaise"]),
                )

        for b in range(1, 401):
            day_ago = b % 30
            b_date = add_days_to_date_str(today, -day_ago)
            hour = 8 + (b % 13)
            time_str = f"{hour:02d}:{'15' if b % 2 == 0 else '45'}:00+05:30"
            member = None if b % 3 == 0 else member_rows[b % 45]
            item_a = menu_rows[b % len(menu_rows)]
            item_b = menu_rows[(b + 7) % len(menu_rows)]
            q_a = 1 + (b % 2)
            sub = item_a["pricePaise"] * q_a + item_b["pricePaise"]
            disc_pct = plan_map[member["planCode"]]["barDiscountPct"] if member else 0
            disc = round((sub * disc_pct) / 100)
            tax = round(((sub - disc) * 5) / 100)
            total = sub - disc + tax
            method = pick(["CASH", "CARD", "UPI"])

            bo = db.insert_returning(
                """
                INSERT INTO bar_orders
                  (order_number, table_id, member_id, staff_user_id, kds_status, billing_status,
                   subtotal_paise, discount_paise, tax_paise, total_paise, created_at, served_at)
                VALUES (?, ?, ?, ?, 'SERVED', 'PAID', ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    f"BAR-{2000 + b}",
                    table_rows[b % len(table_rows)]["id"],
                    member["id"] if member else None,
                    user_map["bar@club.com"],
                    sub,
                    disc,
                    tax,
                    total,
                    f"{b_date}T{time_str}",
                    f"{b_date}T{time_str}",
                ),
            )
            db.execute(
                """
                INSERT INTO bar_order_items (bar_order_id, menu_item_id, item_name, quantity, unit_price_paise, line_total_paise)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (bo["id"], item_a["id"], item_a["name"], q_a, item_a["pricePaise"], item_a["pricePaise"] * q_a),
            )
            db.execute(
                """
                INSERT INTO bar_order_items (bar_order_id, menu_item_id, item_name, quantity, unit_price_paise, line_total_paise)
                VALUES (?, ?, ?, 1, ?, ?)
                """,
                (bo["id"], item_b["id"], item_b["name"], item_b["pricePaise"], item_b["pricePaise"]),
            )
            db.execute(
                """
                INSERT INTO payments (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                VALUES ('BAR_ORDER', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                """,
                (bo["id"], member["id"] if member else None, total, method, user_map["bar@club.com"], f"{b_date}T{time_str}"),
            )
            db.execute(
                """
                INSERT INTO transactions (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                VALUES ('INCOME', 'BAR', ?, ?, ?, ?, 'BAR_ORDER', ?, ?)
                """,
                (method, total, tax, f"Bar Order {bo['orderNumber']}", bo["id"], f"{b_date}T{time_str}"),
            )

        # 9. 12 Employees, Shifts, Attendance, 5 Leave Requests, 1 Payroll Run
        employees_seed = [
            ("EMP-001", "Priya Nair", "manager@club.com", "MANAGEMENT", "General Club Manager", 9500000, user_map["manager@club.com"]),
            ("EMP-002", "Rohan Kulkarni", "frontdesk@club.com", "FRONT_DESK", "Lead Front Desk Coordinator", 4200000, user_map["frontdesk@club.com"]),
            ("EMP-003", "Sneha Joshi", "sneha.j@club.com", "FRONT_DESK", "Member Relations Executive", 3600000, None),
            ("EMP-004", "Sandeep Verma", "bar@club.com", "BAR", "Head Barista & Lounge Lead", 4400000, user_map["bar@club.com"]),
            ("EMP-005", "Kiran Shetty", "kiran.s@club.com", "BAR", "Kitchen Chef", 4800000, None),
            ("EMP-006", "Deepak Rao", "deepak.r@club.com", "BAR", "Cafe Server", 2800000, None),
            ("EMP-007", "Meera Iyer", "shop@club.com", "SHOP", "Pro Shop & Inventory Manager", 4500000, user_map["shop@club.com"]),
            ("EMP-008", "Akash Patel", "akash.p@club.com", "SHOP", "Racket Stringer & Sales", 3200000, None),
            ("EMP-009", "Coach Mahesh Bhupathi Jr", "mahesh.c@club.com", "COACHING", "Head Tennis Coach", 8500000, None),
            ("EMP-010", "Coach Rahul Dravid Jr", "rahul.c@club.com", "COACHING", "Cricket Academy Director", 8000000, None),
            ("EMP-011", "Suresh Gowda", "suresh.m@club.com", "MAINTENANCE", "Court Grounds Supervisor", 3000000, None),
            ("EMP-012", "Lakshmi Devi", "lakshmi.m@club.com", "MAINTENANCE", "Facility Housekeeping Lead", 2600000, None),
        ]
        emp_rows: list[dict[str, Any]] = []
        for idx, (ecode, ename, eemail, edept, etitle, esal, euid) in enumerate(employees_seed):
            emp = db.insert_returning(
                """
                INSERT INTO employees
                  (user_id, employee_code, full_name, email, phone, department, designation,
                   monthly_salary_paise, leave_balance_days, join_date, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2024-04-01', 1)
                RETURNING *
                """,
                (
                    euid,
                    ecode,
                    ename,
                    eemail,
                    f"+91 97400 {str(10001 + idx * 111)[:5]}",
                    edept,
                    etitle,
                    esal,
                    16 - (idx % 5),
                ),
            )
            emp_rows.append(emp)

            shift_type = "MORNING" if idx % 2 == 0 else "EVENING"
            station = (
                "Bar & Cafe"
                if edept == "BAR"
                else ("Pro Shop" if edept == "SHOP" else ("Front Desk" if edept == "FRONT_DESK" else "Courts"))
            )
            db.execute(
                """
                INSERT INTO shifts (employee_id, shift_date, shift_type, start_time, end_time, station)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    emp["id"],
                    today,
                    shift_type,
                    "06:00" if shift_type == "MORNING" else "14:00",
                    "14:00" if shift_type == "MORNING" else "22:00",
                    station,
                ),
            )
            db.execute(
                """
                INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, status, overtime_minutes)
                VALUES (?, ?, ?, NULL, 'PRESENT', ?)
                """,
                (
                    emp["id"],
                    today,
                    f"{today}T05:56:00+05:30" if shift_type == "MORNING" else f"{today}T13:55:00+05:30",
                    30 if idx % 4 == 0 else 0,
                ),
            )

        leaves_seed = [
            (2, "CASUAL", add_days_to_date_str(today, 4), add_days_to_date_str(today, 5), 2, "Family wedding in Pune", "PENDING"),
            (5, "SICK", add_days_to_date_str(today, 2), add_days_to_date_str(today, 2), 1, "Dental appointment", "PENDING"),
            (7, "EARNED", add_days_to_date_str(today, -10), add_days_to_date_str(today, -8), 3, "Annual family trip", "APPROVED"),
            (10, "CASUAL", add_days_to_date_str(today, -4), add_days_to_date_str(today, -4), 1, "Personal errand", "APPROVED"),
            (3, "CASUAL", add_days_to_date_str(today, 1), add_days_to_date_str(today, 3), 3, "Weekend festival rush conflict", "REJECTED"),
        ]
        for emp_idx, ltype, lstart, lend, ldays, lreason, lstatus in leaves_seed:
            db.execute(
                """
                INSERT INTO leave_requests
                  (employee_id, leave_type, start_date, end_date, days_count, reason, status, reviewed_by_user_id, reviewed_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    emp_rows[emp_idx]["id"],
                    ltype,
                    lstart,
                    lend,
                    ldays,
                    lreason,
                    lstatus,
                    None if lstatus == "PENDING" else user_map["manager@club.com"],
                    None if lstatus == "PENDING" else created_at,
                    created_at,
                ),
            )

        last_month_date = add_days_to_date_str(today, -30)
        pay_month = last_month_date[:7]
        total_gross = sum(e["monthlySalaryPaise"] for e in emp_rows)
        total_ded = round(total_gross * 0.08)
        total_net = total_gross - total_ded
        pr = db.insert_returning(
            """
            INSERT INTO payroll_runs
              (pay_month, total_gross_paise, total_deductions_paise, total_net_paise, status, processed_by_user_id, processed_at)
            VALUES (?, ?, ?, ?, 'PROCESSED', ?, ?)
            RETURNING *
            """,
            (pay_month, total_gross, total_ded, total_net, user_map["owner@club.com"], f"{last_month_date}T18:00:00+05:30"),
        )
        for e in emp_rows:
            ded = round(e["monthlySalaryPaise"] * 0.08)
            db.execute(
                """
                INSERT INTO payslips (payroll_run_id, employee_id, base_salary_paise, overtime_paise, deductions_paise, net_pay_paise)
                VALUES (?, ?, ?, 0, ?, ?)
                """,
                (pr["id"], e["id"], e["monthlySalaryPaise"], ded, e["monthlySalaryPaise"] - ded),
            )

        # 10. Corporate Clients, Invoices, Expenses
        corp_clients = [
            ("Razorpay Software Pvt Ltd", "Ankit Verma", "wellness@razorpay.com", "+91 80 4567 8900", "29AABCR1234A1Z5", "Koramangala 4th Block, Bengaluru 560034"),
            ("Zerodha Broking Ltd", "Nikhil K.", "hr@zerodha.com", "+91 80 4718 1888", "29AAACZ9876B1Z2", "JP Nagar 4th Phase, Bengaluru 560078"),
            ("Ather Energy Pvt Ltd", "Tarun Mehta", "benefits@atherenergy.com", "+91 80 6646 5750", "29AADCA4567C1Z8", "IBC Knowledge Park, Bengaluru 560029"),
        ]
        client_rows = [
            db.insert_returning(
                """
                INSERT INTO clients (company_name, contact_person, email, phone, gst_number, billing_address, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (*c, created_at),
            )
            for c in corp_clients
        ]

        invoices_seed = [
            ("INV-2026-001", client_rows[0]["id"], add_days_to_date_str(today, -20), add_days_to_date_str(today, -5), "PAID", 12000000, 14160000, "Quarterly Corporate Wellness Court Retainer (25 passes)"),
            ("INV-2026-002", client_rows[1]["id"], add_days_to_date_str(today, -8), add_days_to_date_str(today, 7), "SENT", 8500000, 0, "Annual Inter-Corporate Padel & Tennis League Hosting"),
            ("INV-2026-003", client_rows[2]["id"], add_days_to_date_str(today, -35), add_days_to_date_str(today, -15), "OVERDUE", 6000000, 0, "Employee Cricket Nets Evening Block Booking"),
        ]
        for num, cid, issue_d, due_d, st, sub, paid, desc in invoices_seed:
            tax = round(sub * 0.18)
            total = sub + tax
            inv = db.insert_returning(
                """
                INSERT INTO invoices
                  (invoice_number, invoice_type, client_id, issue_date, due_date, status,
                   subtotal_paise, tax_paise, total_paise, paid_paise, notes, created_at)
                VALUES (?, 'CORPORATE', ?, ?, ?, ?, ?, ?, ?, ?, 'Net 15 payment terms. GST 18% included.', ?)
                RETURNING *
                """,
                (num, cid, issue_d, due_d, st, sub, tax, total, paid, f"{issue_d}T10:00:00+05:30"),
            )
            db.execute(
                """
                INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_paise, tax_rate_pct, line_total_paise)
                VALUES (?, ?, 1, ?, 18, ?)
                """,
                (inv["id"], desc, sub, sub),
            )
            if st == "PAID":
                db.execute(
                    """
                    INSERT INTO payments (reference_type, reference_id, amount_paise, method, status, received_by_user_id, paid_at)
                    VALUES ('INVOICE', ?, ?, 'BANK_TRANSFER', 'SUCCESS', ?, ?)
                    """,
                    (inv["id"], total, user_map["owner@club.com"], f"{issue_d}T14:00:00+05:30"),
                )
                db.execute(
                    """
                    INSERT INTO transactions (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                    VALUES ('INCOME', 'CORPORATE_INVOICE', 'BANK_TRANSFER', ?, ?, ?, 'INVOICE', ?, ?)
                    """,
                    (total, tax, f"Corporate Invoice {num}", inv["id"], f"{issue_d}T14:00:00+05:30"),
                )

        expenses_seed = [
            ("RENT", "Prestige Sports Estates", "Monthly Clubhouse & Grounds Lease", 18500000, 25, "PAID", 1),
            ("SALARIES", "Club Payroll", f"Staff Payroll ({pay_month})", total_net, 20, "PAID", 1),
            ("UTILITIES", "BESCOM Commercial Power", "Court Floodlights & HVAC Electricity", 4200000, 14, "PAID", 1),
            ("INVENTORY_PURCHASE", "ProAce Racquet Sports India", "Q4 Tennis Balls & Overgrips Restock", 3800000, 10, "PAID", 0),
            ("MAINTENANCE", "DecoSurface India", "Court 1 & 2 Acrylic Pressure Wash", 2400000, 5, "PAYABLE", 0),
            ("UTILITIES", "BWSSB Water & Turf Irrigation", "Clubhouse & Clay Court Water Supply", 1150000, 2, "PAID", 1),
            ("MARKETING", "Local Athletics Digital", "Padel Open House Campaign", 1500000, 0, "PAID", 0),
        ]
        for cat, vendor, desc, amt, day_ago, st, rec in expenses_seed:
            e_date = add_days_to_date_str(today, -day_ago)
            tax = 0 if cat == "SALARIES" else round(amt * 0.18)
            exp = db.insert_returning(
                """
                INSERT INTO expenses
                  (category, vendor_name, description, amount_paise, tax_paise, expense_date, due_date, status, is_recurring, created_by_user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    cat,
                    vendor,
                    desc,
                    amt,
                    tax,
                    e_date,
                    add_days_to_date_str(today, 10) if st == "PAYABLE" else e_date,
                    st,
                    rec,
                    user_map["owner@club.com"],
                    f"{e_date}T12:00:00+05:30",
                ),
            )
            if st == "PAID":
                db.execute(
                    """
                    INSERT INTO transactions (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                    VALUES ('EXPENSE', ?, 'BANK_TRANSFER', ?, ?, ?, 'EXPENSE', ?, ?)
                    """,
                    (cat, amt + tax, tax, f"{vendor} — {desc}", exp["id"], f"{e_date}T12:00:00+05:30"),
                )

        # 11. 15 CRM Leads + Notes + Quotes
        leads_seed = [
            ("Rishabh Pant", "rishabh.p@example.in", "+91 98100 22334", "WEBSITE", "GOLD_MEMBERSHIP", "NEW", "Interested in morning tennis slots & Gold annual plan."),
            ("Shreya Ghoshal", "shreya.g@example.in", "+91 98100 33445", "PHONE", "SILVER_MEMBERSHIP", "CONTACTED", "Called asking about weekend padel court rates."),
            ("Aryan Khanna", "aryan.k@example.in", "+91 98100 44556", "WALK_IN", "JUNIOR_ACADEMY", "QUOTE_SENT", "14-year-old looking for cricket & tennis afternoon coaching."),
            ("Cred Technologies HR", "culture@cred.club", "+91 80 3344 5566", "REFERRAL", "CORPORATE", "QUOTE_SENT", "Looking for 40 corporate flex passes for Friday evenings."),
            ("Nandini Krishnan", "nandini.k@example.in", "+91 98100 55667", "WEBSITE", "TRIAL", "NEW", "Would like to book a padel trial with a coach."),
            ("Manish Pandey", "manish.p@example.in", "+91 98100 66778", "WALK_IN", "GOLD_MEMBERSHIP", "WON", "Toured facility, signed up on the spot."),
            ("Sana Mir", "sana.m@example.in", "+91 98100 77889", "WEBSITE", "SILVER_MEMBERSHIP", "CONTACTED", "Comparing Gold vs Silver monthly commitment."),
            ("Gautam Adani Jr", "gautam.j@example.in", "+91 98100 88990", "PHONE", "GOLD_MEMBERSHIP", "LOST", "Relocated to Mumbai."),
            ("Ritu Rathee", "ritu.r@example.in", "+91 98100 99001", "WEBSITE", "JUNIOR_ACADEMY", "NEW", "Enquiring for twins aged 11."),
            ("Swiggy Sports Club", "sports@swiggy.in", "+91 80 4455 6677", "REFERRAL", "CORPORATE", "CONTACTED", "Monthly cricket net tournament package."),
            ("Vikrant Massey", "vikrant.m@example.in", "+91 98220 11223", "WEBSITE", "SILVER_MEMBERSHIP", "NEW", "Weekend tennis & cafe access."),
            ("Aditi Rao", "aditi.r@example.in", "+91 98220 22334", "WALK_IN", "GOLD_MEMBERSHIP", "QUOTE_SENT", "Wants annual Gold quote with family add-on."),
            ("Kunal Shah", "kunal.s@example.in", "+91 98220 33445", "REFERRAL", "GOLD_MEMBERSHIP", "WON", "Referred by Arjun Mehta."),
            ("Divya Bharti", "divya.b@example.in", "+91 98220 44556", "PHONE", "TRIAL", "CONTACTED", "Looking for beginner padel trial."),
            ("Harshit Rana", "harshit.r@example.in", "+91 98220 55667", "WEBSITE", "SILVER_MEMBERSHIP", "LOST", "Prefers morning swimming pool."),
        ]
        for idx, (lname, lemail, lphone, lsrc, linterest, lst, lmsg) in enumerate(leads_seed):
            lead = db.insert_returning(
                """
                INSERT INTO leads
                  (full_name, email, phone, source, interest, message, status, assigned_user_id, follow_up_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    lname,
                    lemail,
                    lphone,
                    lsrc,
                    linterest,
                    lmsg,
                    lst,
                    user_map["frontdesk@club.com"],
                    add_days_to_date_str(today, (idx % 5) + 1),
                    f"{add_days_to_date_str(today, -(idx % 10))}T10:30:00+05:30",
                ),
            )
            db.execute(
                """
                INSERT INTO lead_notes (lead_id, author_user_id, note, created_at)
                VALUES (?, ?, 'Initial discovery call logged; shared court schedule and fee sheet.', ?)
                """,
                (lead["id"], user_map["frontdesk@club.com"], created_at),
            )
            if lst == "QUOTE_SENT":
                plan = plan_map["JUNIOR"] if linterest == "JUNIOR_ACADEMY" else plan_map["GOLD"]
                db.execute(
                    """
                    INSERT INTO quotes
                      (quote_number, lead_id, plan_id, billing_cycle, quoted_amount_paise, discount_paise,
                       final_amount_paise, valid_until, notes, created_by_user_id, created_at)
                    VALUES (?, ?, ?, 'ANNUAL', ?, 250000, ?, ?, 'Includes 2 complimentary guest passes upon sign-up.', ?, ?)
                    """,
                    (
                        f"QT-2026-{idx + 1:03d}",
                        lead["id"],
                        plan["id"],
                        plan["annualPricePaise"],
                        plan["annualPricePaise"] - 250000,
                        add_days_to_date_str(today, 14),
                        user_map["manager@club.com"],
                        created_at,
                    ),
                )

        # 12. Notifications & Audit Logs
        notifications_seed = [
            ("FRONT_DESK", None, "IN_APP", "9 Memberships Expiring Within 15 Days", "Automated renewal reminders queued for Gold & Silver members expiring soon."),
            ("SHOP_STAFF", None, "IN_APP", "Low Stock Alert: 6 Pro Shop SKUs Below Reorder Level", "Head Tour Tennis Balls, Yonex Aerosensa 50 Shuttles, and Nox AT10 Padel require restock."),
            ("MANAGER", None, "IN_APP", "2 Pending Staff Leave Requests", "Sneha Joshi and Deepak Rao have submitted leave requests awaiting review."),
            ("MEMBER", arjun["id"], "EMAIL_STUB", "Welcome to Alpha Sports Club — Court 1 Confirmed Tonight", "Your 18:00 booking on Centre Court 1 is confirmed. Enjoy 15% off post-match recovery at the Club Lounge."),
        ]
        for trole, mid, chan, title, body in notifications_seed:
            db.execute(
                """
                INSERT INTO notifications (target_role, member_id, channel, title, body, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
                """,
                (trole, mid, chan, title, body, created_at),
            )

        db.execute(
            """
            INSERT INTO audit_logs (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
            VALUES (?, 'Vikramaditya Rao', 'PAYROLL_RUN', 'PAYROLL', ?, ?, ?)
            """,
            (user_map["owner@club.com"], str(pr["id"]), json.dumps({"payMonth": pay_month, "totalNetPaise": total_net}), created_at),
        )
        db.execute(
            """
            INSERT INTO audit_logs (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
            VALUES (?, 'Priya Nair', 'COURT_BLOCK_CREATED', 'COURT', ?, ?, ?)
            """,
            (user_map["manager@club.com"], str(court_rows[2]["id"]), json.dumps({"reason": "Clay line brushing", "date": tomorrow}), created_at),
        )


if __name__ == "__main__":
    reset_flag = "--no-reset" not in sys.argv
    seed_database(reset=reset_flag)
    print("\n=== Alpha Sports Club Database Seeded (Python) ===")
    print("Demo Credentials (Password for all: Password@123):")
    print("  OWNER      : owner@club.com")
    print("  MANAGER    : manager@club.com")
    print("  FRONT_DESK : frontdesk@club.com")
    print("  BAR_STAFF  : bar@club.com")
    print("  SHOP_STAFF : shop@club.com")
    print("  MEMBER     : member@club.com (Arjun Mehta · CC-00001 · Gold)")
    print("==============================================\n")
