from __future__ import annotations

import json
import os
import threading

import pytest
from fastapi.testclient import TestClient

from backend.db import create_db_connection
from backend.main import create_app
from backend.seed import seed_database
from backend.services.bar_service import (
    create_bar_order,
    get_daily_bar_closing_report,
    settle_tab,
)
from backend.services.booking_service import (
    calculate_court_quote,
    cancel_booking,
    create_booking,
    create_social_session,
    join_social_session,
)
from backend.services.membership_service import (
    lookup_member_by_qr_token,
    register_member,
    sync_membership_statuses,
)
from backend.services.shop_service import (
    create_shop_order,
    update_shop_order_status,
)
from backend.time_utils import add_days_to_date_str, ist_date_time_to_ms, to_ist_date_string
from backend.errors import AppError
from backend.routers.bar import CreateMemberBarOrderRequest, create_member_order
from backend.security import AuthUser


@pytest.fixture()
def club_db():
    db = create_db_connection(":memory:")
    seed_database(db, reset=True)
    yield db
    db.close()


def test_rule_1_concurrent_bookings_only_one_succeeds(club_db):
    courts = club_db.fetch_all("SELECT * FROM courts ORDER BY id ASC")
    court = courts[1]
    future_date = add_days_to_date_str(to_ist_date_string(), 5)

    results: list[str] = []
    lock = threading.Lock()

    def attempt(guest_name: str, phone: str):
        try:
            create_booking(
                {
                    "courtId": court["id"],
                    "bookingDate": future_date,
                    "startTimeHHMM": "10:00",
                    "guestName": guest_name,
                    "guestPhone": phone,
                },
                club_db,
            )
            with lock:
                results.append("OK")
        except AppError:
            with lock:
                results.append("ERR")

    t1 = threading.Thread(target=attempt, args=("Player One", "+91 90000 00001"))
    t2 = threading.Thread(target=attempt, args=("Player Two", "+91 90000 00002"))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert results.count("OK") == 1
    assert results.count("ERR") == 1


def test_rule_2_overlapping_60_min_slots(club_db):
    courts = club_db.fetch_all("SELECT * FROM courts ORDER BY id ASC")
    court = courts[1]
    future_date = add_days_to_date_str(to_ist_date_string(), 5)

    b1 = create_booking(
        {
            "courtId": court["id"],
            "bookingDate": future_date,
            "startTimeHHMM": "18:30",
            "guestName": "Anchor Player",
            "guestPhone": "+91 90000 11111",
        },
        club_db,
    )
    assert b1["id"] > 0

    with pytest.raises(AppError, match="already has a booking overlapping"):
        create_booking(
            {
                "courtId": court["id"],
                "bookingDate": future_date,
                "startTimeHHMM": "18:00",
                "guestName": "Early Conflict",
                "guestPhone": "+91 90000 22222",
            },
            club_db,
        )

    with pytest.raises(AppError, match="already has a booking overlapping"):
        create_booking(
            {
                "courtId": court["id"],
                "bookingDate": future_date,
                "startTimeHHMM": "19:00",
                "guestName": "Late Conflict",
                "guestPhone": "+91 90000 33333",
            },
            club_db,
        )

    b2 = create_booking(
        {
            "courtId": court["id"],
            "bookingDate": future_date,
            "startTimeHHMM": "19:30",
            "guestName": "Adjacent Player",
            "guestPhone": "+91 90000 44444",
        },
        club_db,
    )
    assert b2["id"] > 0


def test_rule_3_daily_booking_limit_and_cancel_frees_slot(club_db):
    courts = club_db.fetch_all("SELECT * FROM courts ORDER BY id ASC")
    member = club_db.fetch_one("SELECT * FROM members ORDER BY id ASC LIMIT 1")
    future_date = add_days_to_date_str(to_ist_date_string(), 5)

    b1 = create_booking(
        {
            "courtId": courts[0]["id"],
            "bookingDate": future_date,
            "startTimeHHMM": "07:00",
            "memberId": member["id"],
        },
        club_db,
    )
    create_booking(
        {
            "courtId": courts[1]["id"],
            "bookingDate": future_date,
            "startTimeHHMM": "09:00",
            "memberId": member["id"],
        },
        club_db,
    )

    with pytest.raises(AppError, match="Daily limit reached"):
        create_booking(
            {
                "courtId": courts[2]["id"],
                "bookingDate": future_date,
                "startTimeHHMM": "11:00",
                "memberId": member["id"],
            },
            club_db,
        )

    cancel_booking(
        b1["id"],
        {"nowMs": ist_date_time_to_ms(future_date, "06:00") - 5 * 3600 * 1000},
        club_db,
    )

    b3 = create_booking(
        {
            "courtId": courts[2]["id"],
            "bookingDate": future_date,
            "startTimeHHMM": "11:00",
            "memberId": member["id"],
        },
        club_db,
    )
    assert b3["status"] == "CONFIRMED"


def test_rule_4_plan_pricing_across_courts_shop_and_bar(club_db):
    court = club_db.fetch_all("SELECT * FROM courts ORDER BY id ASC")[0]
    all_members = club_db.fetch_all("SELECT * FROM members ORDER BY id ASC")
    gold_member = all_members[0]
    silver_member = all_members[20]
    junior_member = all_members[45]

    gold_quote = calculate_court_quote(court, gold_member["id"], "10:00", club_db)
    assert gold_quote["planCode"] == "GOLD"
    assert gold_quote["finalAmountPaise"] == 0

    silver_quote = calculate_court_quote(court, silver_member["id"], "10:00", club_db)
    assert silver_quote["planCode"] == "SILVER"
    assert silver_quote["finalAmountPaise"] == 84000

    junior_quote = calculate_court_quote(court, junior_member["id"], "10:00", club_db)
    assert junior_quote["planCode"] == "JUNIOR"
    assert junior_quote["finalAmountPaise"] == 60000

    guest_quote = calculate_court_quote(court, None, "10:00", club_db)
    assert guest_quote["planCode"] == "GUEST"
    assert guest_quote["finalAmountPaise"] == 120000

    variant = club_db.fetch_one("SELECT * FROM product_variants ORDER BY id ASC LIMIT 1")
    prod = club_db.fetch_one("SELECT * FROM products WHERE id = ?", (variant["productId"],))
    gold_order = create_shop_order(
        {
            "memberId": gold_member["id"],
            "customerName": gold_member["fullName"],
            "customerPhone": gold_member["phone"],
            "channel": "POS",
            "fulfilmentType": "COUNTER",
            "paymentMethod": "CARD",
            "items": [{"variantId": variant["id"], "quantity": 1}],
        },
        club_db,
    )
    assert gold_order["discountPaise"] == round(prod["pricePaise"] * 0.15)

    menu_item = club_db.fetch_one("SELECT * FROM menu_items ORDER BY id ASC LIMIT 1")
    bar_ord = create_bar_order(
        {
            "memberId": silver_member["id"],
            "paymentMethod": "UPI",
            "items": [{"menuItemId": menu_item["id"], "quantity": 1}],
        },
        club_db,
    )
    assert bar_ord["discountPaise"] == round(menu_item["pricePaise"] * 0.10)


def test_rule_5_social_session_capacity_and_booking_block(club_db):
    court = club_db.fetch_all("SELECT * FROM courts ORDER BY id ASC")[2]
    future_date = add_days_to_date_str(to_ist_date_string(), 5)
    session = create_social_session(
        {
            "title": "Test Friday Mixer",
            "courtId": court["id"],
            "sessionDate": future_date,
            "startTimeHHMM": "19:00",
            "durationMinutes": 90,
            "capacity": 2,
            "pricePerHeadPaise": 40000,
        },
        club_db,
    )

    members = club_db.fetch_all("SELECT * FROM members ORDER BY id ASC LIMIT 3")
    join_social_session(session["id"], {"memberId": members[0]["id"], "paymentMethod": "UPI"}, club_db)
    join_social_session(session["id"], {"memberId": members[1]["id"], "paymentMethod": "CARD"}, club_db)

    with pytest.raises(AppError, match="Social session is full"):
        join_social_session(session["id"], {"memberId": members[2]["id"], "paymentMethod": "UPI"}, club_db)

    with pytest.raises(AppError, match="Social Play session"):
        create_booking(
            {
                "courtId": court["id"],
                "bookingDate": future_date,
                "startTimeHHMM": "19:30",
                "guestName": "Blocked Exclusive",
                "guestPhone": "+91 90000 55555",
            },
            club_db,
        )


def test_rule_6_shop_stock_integrity_and_cancel_restores(club_db):
    variant = club_db.fetch_one("SELECT * FROM product_variants ORDER BY id ASC LIMIT 1")
    start_qty = variant["stockQty"]

    create_shop_order(
        {
            "customerName": "Counter Buyer",
            "customerPhone": "+91 99999 00001",
            "channel": "POS",
            "fulfilmentType": "COUNTER",
            "paymentMethod": "CASH",
            "items": [{"variantId": variant["id"], "quantity": 2}],
        },
        club_db,
    )
    after_pos = club_db.fetch_one("SELECT stock_qty FROM product_variants WHERE id = ?", (variant["id"],))
    assert after_pos["stockQty"] == start_qty - 2

    with pytest.raises(AppError, match="Insufficient stock"):
        create_shop_order(
            {
                "customerName": "Online Overbuy",
                "customerPhone": "+91 99999 00002",
                "channel": "ONLINE",
                "fulfilmentType": "PICKUP",
                "paymentMethod": "ONLINE",
                "items": [{"variantId": variant["id"], "quantity": after_pos["stockQty"] + 1}],
            },
            club_db,
        )

    online_order = create_shop_order(
        {
            "customerName": "Online Buyer",
            "customerPhone": "+91 99999 00003",
            "channel": "ONLINE",
            "fulfilmentType": "PICKUP",
            "paymentMethod": "ONLINE",
            "items": [{"variantId": variant["id"], "quantity": 3}],
        },
        club_db,
    )
    after_online = club_db.fetch_one("SELECT stock_qty FROM product_variants WHERE id = ?", (variant["id"],))
    assert after_online["stockQty"] == start_qty - 5

    update_shop_order_status(online_order["id"], "CANCELLED", None, "Staff", "SHOP_STAFF", None, club_db)
    after_cancel = club_db.fetch_one("SELECT stock_qty FROM product_variants WHERE id = ?", (variant["id"],))
    assert after_cancel["stockQty"] == start_qty - 2


def test_rule_7_membership_expiry_lifecycle(club_db):
    reg = register_member(
        {
            "fullName": "Date Lifecycle Member",
            "email": "lifecycle@example.in",
            "phone": "+91 98000 12345",
            "dob": "1992-05-15",
            "emergencyContactName": "Parent",
            "emergencyContactPhone": "+91 98000 54321",
            "planCode": "SILVER",
            "billingCycle": "MONTHLY",
            "paymentMethod": "CARD",
        },
        club_db,
    )
    end_date = reg["membership"]["endDate"]

    sync_membership_statuses(club_db, add_days_to_date_str(end_date, -10))
    expiring_row = club_db.fetch_one("SELECT status FROM members WHERE id = ?", (reg["member"]["id"],))
    assert expiring_row["status"] == "EXPIRING_SOON"

    sync_membership_statuses(club_db, add_days_to_date_str(end_date, 2))
    expired_row = club_db.fetch_one("SELECT status FROM members WHERE id = ?", (reg["member"]["id"],))
    assert expired_row["status"] == "EXPIRED"


def test_rule_8_junior_plan_enforced_under_18(club_db):
    under_18_dob = add_days_to_date_str(to_ist_date_string(), -(15 * 365))

    with pytest.raises(AppError, match="under 18"):
        register_member(
            {
                "fullName": "Young Athlete",
                "email": "junior.try@example.in",
                "phone": "+91 98000 99999",
                "dob": under_18_dob,
                "emergencyContactName": "Guardian",
                "emergencyContactPhone": "+91 98000 88888",
                "planCode": "GOLD",
                "billingCycle": "ANNUAL",
                "paymentMethod": "CARD",
            },
            club_db,
        )

    junior_reg = register_member(
        {
            "fullName": "Young Athlete",
            "email": "junior.ok@example.in",
            "phone": "+91 98000 99999",
            "dob": under_18_dob,
            "emergencyContactName": "Guardian",
            "emergencyContactPhone": "+91 98000 88888",
            "planCode": "JUNIOR",
            "billingCycle": "ANNUAL",
            "paymentMethod": "CARD",
        },
        club_db,
    )
    assert junior_reg["member"]["plan"]["code"] == "JUNIOR"


def test_rule_9_bar_tab_settlement_and_closing_report_reconciliation(club_db):
    member = club_db.fetch_all("SELECT * FROM members ORDER BY id ASC LIMIT 6")[5]
    menu_items = club_db.fetch_all("SELECT * FROM menu_items ORDER BY id ASC LIMIT 2")

    tab_ord = create_bar_order(
        {
            "memberId": member["id"],
            "chargeToTab": True,
            "items": [{"menuItemId": menu_items[0]["id"], "quantity": 2}],
        },
        club_db,
    )
    assert tab_ord["billingStatus"] == "ON_TAB"
    assert tab_ord["tabId"] is not None

    part_cash = tab_ord["totalPaise"] // 2
    part_upi = tab_ord["totalPaise"] - part_cash
    settlement = settle_tab(
        tab_ord["tabId"],
        [
            {"method": "CASH", "amountPaise": part_cash},
            {"method": "UPI", "amountPaise": part_upi},
        ],
        None,
        club_db,
    )
    assert settlement["status"] == "SETTLED"
    assert settlement["balanceDuePaise"] == 0

    report = get_daily_bar_closing_report(to_ist_date_string(), club_db)
    method_sum = (
        report["byPaymentMethod"].get("CASH", 0)
        + report["byPaymentMethod"].get("CARD", 0)
        + report["byPaymentMethod"].get("UPI", 0)
    )
    assert method_sum == report["totalCollectedPaise"]
    assert report["totalCollectedPaise"] >= tab_ord["totalPaise"]


def test_rule_10_qr_pass_lookup(club_db):
    arjun = club_db.fetch_one("SELECT * FROM members WHERE member_code = 'CC-00001'")
    by_qr = lookup_member_by_qr_token(arjun["qrToken"], club_db)
    assert by_qr["id"] == arjun["id"]
    assert by_qr["plan"]["code"] == "GOLD"

    by_code = lookup_member_by_qr_token("cc-00001", club_db)
    assert by_code["id"] == arjun["id"]

    by_json = lookup_member_by_qr_token(json.dumps({"qrToken": arjun["qrToken"]}), club_db)
    assert by_json["id"] == arjun["id"]

    with pytest.raises(AppError, match="No member profile found"):
        lookup_member_by_qr_token("INVALID-QR-PASS", club_db)


def test_member_cafe_order_uses_authenticated_member(monkeypatch, club_db):
    from backend.services import bar_service

    monkeypatch.setattr(bar_service, "get_db", lambda: club_db)
    member = club_db.fetch_one(
        "SELECT id, user_id FROM members WHERE member_code = 'CC-00001'"
    )
    menu_item = club_db.fetch_one(
        "SELECT id FROM menu_items WHERE is_available = 1 ORDER BY id LIMIT 1"
    )
    assert member is not None
    assert menu_item is not None

    result = create_member_order(
        CreateMemberBarOrderRequest(
            chargeToTab=True,
            items=[{"menuItemId": menu_item["id"], "quantity": 1}],
        ),
        AuthUser(
            id=member["userId"],
            email="member@club.com",
            fullName="Member",
            role="MEMBER",
            memberId=member["id"],
        ),
    )

    assert result["order"]["memberId"] == member["id"]
    assert result["order"]["tableId"] is None
    assert result["order"]["billingStatus"] == "ON_TAB"


def test_email_otp_login_is_single_use(monkeypatch, club_db):
    from backend.services import auth_service

    sent_codes: list[tuple[str, str]] = []
    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "club@example.com")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "app-password")
    monkeypatch.setattr(
        auth_service,
        "_send_login_otp_email",
        lambda email, code, _sender, _password: sent_codes.append((email, code)),
    )

    requested = auth_service.request_email_login_otp("MEMBER@CLUB.COM", club_db)
    assert requested["ok"] is True
    assert sent_codes[0][0] == "member@club.com"
    assert len(sent_codes[0][1]) == 6

    result = auth_service.verify_email_login_otp(
        "member@club.com", sent_codes[0][1], club_db
    )
    assert result["user"]["email"] == "member@club.com"
    assert result["user"]["role"] == "MEMBER"
    assert result["user"]["memberId"] is not None
    assert result["token"]

    with pytest.raises(AppError) as error:
        auth_service.verify_email_login_otp(
            "member@club.com", sent_codes[0][1], club_db
        )
    assert error.value.code == "INVALID_OTP"


def test_email_otp_does_not_send_to_unknown_accounts(monkeypatch, club_db):
    from backend.services import auth_service

    sent_codes: list[str] = []
    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "club@example.com")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "app-password")
    monkeypatch.setattr(
        auth_service,
        "_send_login_otp_email",
        lambda email, _code, _sender, _password: sent_codes.append(email),
    )

    response = auth_service.request_email_login_otp("unknown@example.com", club_db)
    assert response["ok"] is True
    assert sent_codes == []


def test_email_otp_is_only_sent_to_members(monkeypatch, club_db):
    from backend.services import auth_service

    sent_codes: list[str] = []
    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "club@example.com")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "app-password")
    monkeypatch.setattr(
        auth_service,
        "_send_login_otp_email",
        lambda email, _code, _sender, _password: sent_codes.append(email),
    )

    response = auth_service.request_email_login_otp("owner@club.com", club_db)

    assert response["ok"] is True
    assert sent_codes == []


def test_email_otp_cannot_authenticate_staff(monkeypatch, club_db):
    from backend.services import auth_service

    email = "owner@club.com"
    code = "123456"
    now = int(auth_service.time.time())
    club_db.execute(
        """
        INSERT INTO email_login_otps
          (email, code_hash, expires_at, attempts, last_sent_at, window_started_at, request_count)
        VALUES (?, ?, ?, 0, ?, ?, 1)
        """,
        (email, auth_service._email_otp_hash(email, code), now + 600, now, now),
    )

    with pytest.raises(AppError) as error:
        auth_service.verify_email_login_otp(email, code, club_db)

    assert error.value.code == "INVALID_OTP"


def test_staff_and_owner_login_without_email_otp(monkeypatch, club_db):
    from backend.services import auth_service

    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "")

    for email, expected_role in (
        ("owner@club.com", "OWNER"),
        ("manager@club.com", "MANAGER"),
        ("frontdesk@club.com", "FRONT_DESK"),
    ):
        result = auth_service.login_user(email, "Password@123", club_db)
        assert result["requiresEmailVerification"] is False
        assert result["user"]["role"] == expected_role
        assert result["token"]


def test_email_otp_requires_gmail_configuration(monkeypatch, club_db):
    from backend.services import auth_service

    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "")

    with pytest.raises(AppError) as error:
        auth_service.request_email_login_otp("member@club.com", club_db)
    assert error.value.code == "EMAIL_OTP_NOT_CONFIGURED"


def test_email_otp_limits_verification_attempts(monkeypatch, club_db):
    from backend.services import auth_service

    sent_codes: list[str] = []
    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "club@example.com")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "app-password")
    monkeypatch.setattr(
        auth_service,
        "_send_login_otp_email",
        lambda _email, code, _sender, _password: sent_codes.append(code),
    )
    auth_service.request_email_login_otp("member@club.com", club_db)

    for attempt in range(auth_service.OTP_MAX_ATTEMPTS):
        with pytest.raises(AppError) as error:
            auth_service.verify_email_login_otp(
                "member@club.com", "000000" if sent_codes[0] != "000000" else "000001", club_db
            )
        if attempt + 1 == auth_service.OTP_MAX_ATTEMPTS:
            assert error.value.code == "OTP_ATTEMPTS_EXCEEDED"
        else:
            assert error.value.code == "INVALID_OTP"


def test_email_otp_http_flow_sets_auth_cookie(monkeypatch, club_db):
    from backend.services import auth_service

    monkeypatch.setattr(auth_service, "get_db", lambda: club_db)
    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "club@example.com")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "app-password")
    sent_codes: list[str] = []
    monkeypatch.setattr(
        auth_service,
        "_send_login_otp_email",
        lambda _email, code, _sender, _password: sent_codes.append(code),
    )
    with TestClient(create_app()) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "member@club.com", "password": "Password@123"},
        )
        assert login.status_code == 200
        assert login.json()["requiresEmailVerification"] is True
        assert "token" not in login.json()
        assert "cc_token" not in login.cookies

        verify = client.post(
            "/api/v1/auth/otp/verify",
            json={"email": "member@club.com", "code": sent_codes[0]},
        )

    assert verify.status_code == 200
    assert verify.json()["user"]["email"] == "member@club.com"
    assert "cc_token" in verify.cookies
    verified = club_db.fetch_one(
        "SELECT email_verified FROM users WHERE email = ?",
        ("member@club.com",),
    )
    assert verified["emailVerified"] is True


def test_public_registration_requires_email_verification(club_db):
    from backend.services.auth_service import register_public_member

    registration = register_public_member(
        {
            "fullName": "Email Verify Registration",
            "email": "verify.registration@example.com",
            "phone": "+91 98000 12345",
            "password": "Password@123",
            "dob": "1992-05-15",
            "planCode": "SILVER",
            "billingCycle": "MONTHLY",
            "emergencyContactName": "Emergency Contact",
            "emergencyContactPhone": "+91 98000 54321",
            "paymentMethod": "UPI",
        },
        club_db,
    )
    account = club_db.fetch_one(
        "SELECT email_verified FROM users WHERE id = ?",
        (registration["user"]["id"],),
    )
    assert account["emailVerified"] is False


def test_membership_invoice_number_skips_deleted_numbers(club_db):
    club_db.execute("DELETE FROM invoice_items")
    club_db.execute("DELETE FROM invoices")

    def register(email: str):
        return register_member(
            {
                "fullName": "Invoice Sequence Member",
                "email": email,
                "phone": "+91 98000 12345",
                "dob": "1992-05-15",
                "emergencyContactName": "Emergency Contact",
                "emergencyContactPhone": "+91 98000 54321",
                "planCode": "SILVER",
                "billingCycle": "MONTHLY",
                "paymentMethod": "UPI",
            },
            club_db,
        )

    first = register("invoice.first@example.com")
    second = register("invoice.second@example.com")
    first_invoice = club_db.fetch_one(
        "SELECT id FROM invoices WHERE member_id = ?",
        (first["member"]["id"],),
    )
    club_db.execute(
        "DELETE FROM invoice_items WHERE invoice_id = ?", (first_invoice["id"],)
    )
    club_db.execute("DELETE FROM invoices WHERE id = ?", (first_invoice["id"],))

    third = register("invoice.third@example.com")
    invoice_numbers = club_db.fetch_all(
        """
        SELECT invoice_number FROM invoices
        WHERE member_id IN (?, ?)
        """,
        (second["member"]["id"], third["member"]["id"]),
    )

    assert len({row["invoiceNumber"] for row in invoice_numbers}) == 2


def test_registration_http_sends_verification_code_without_signing_in(monkeypatch, club_db):
    from backend.services import auth_service

    monkeypatch.setattr(auth_service, "get_db", lambda: club_db)
    monkeypatch.setattr(auth_service, "get_gmail_address", lambda: "club@example.com")
    monkeypatch.setattr(auth_service, "get_gmail_app_password", lambda: "app-password")
    sent_to: list[str] = []
    monkeypatch.setattr(
        auth_service,
        "_send_login_otp_email",
        lambda email, _code, _sender, _password: sent_to.append(email),
    )

    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "HTTP Email Verify",
                "email": "http.verify@example.com",
                "phone": "+91 98000 12346",
                "password": "Password@123",
                "dob": "1992-05-15",
                "planCode": "SILVER",
                "billingCycle": "MONTHLY",
                "emergencyContactName": "Emergency Contact",
                "emergencyContactPhone": "+91 98000 54322",
                "paymentMethod": "UPI",
            },
        )

    assert response.status_code == 201
    assert response.json() == {
        "requiresEmailVerification": True,
        "email": "http.verify@example.com",
    }
    assert sent_to == ["http.verify@example.com"]
    assert "cc_token" not in response.cookies


def test_fastapi_http_endpoints_smoke():
    app = create_app()
    with TestClient(app) as client:
        h = client.get("/api/health")
        assert h.status_code == 200
        assert h.json()["framework"] == "fastapi"

        docs = client.get("/api/docs")
        assert docs.status_code == 200

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "owner@club.com", "password": "Password@123"},
        )
        assert login.status_code == 200
        assert login.json()["requiresEmailVerification"] is False
        assert login.json()["user"]["role"] == "OWNER"
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
        assert client.get("/api/v1/members/plans").status_code == 200
        assert client.get("/api/v1/members/qr-lookup?token=CC-00001", headers=headers).status_code == 200
        assert client.get("/api/v1/bookings/availability").status_code == 200
        assert client.get("/api/v1/shop/products").status_code == 200
        assert client.get("/api/v1/bar/menu").status_code == 200
        assert client.get("/api/v1/crm/leads", headers=headers).status_code == 200
        assert client.get("/api/v1/finance/dashboard?period=MONTH", headers=headers).status_code == 200
        assert client.get("/api/v1/hr/overview", headers=headers).status_code == 200
