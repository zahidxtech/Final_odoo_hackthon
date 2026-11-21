from __future__ import annotations

import json
import secrets
from datetime import datetime
from typing import Any

from ..db import Database, get_db
from ..errors import AppError
from ..time_utils import add_days_to_date_str, now_iso, now_ms, parse_iso_ms, to_ist_date_string
from .shop_service import get_low_stock_variants


def _resolve_period_dates(
    period: str, custom_start: str | None = None, custom_end: str | None = None
) -> tuple[str, str]:
    today = to_ist_date_string()
    if period == "TODAY":
        return today, today
    if period == "WEEK":
        return add_days_to_date_str(today, -6), today
    if period == "MONTH":
        return add_days_to_date_str(today, -29), today
    return (
        custom_start or add_days_to_date_str(today, -29),
        custom_end or today,
    )


def get_owner_dashboard(
    period: str = "MONTH",
    custom_start: str | None = None,
    custom_end: str | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    start_date, end_date = _resolve_period_dates(period, custom_start, custom_end)
    all_tx = db.fetch_all("SELECT * FROM transactions")

    period_tx = [
        t for t in all_tx if start_date <= t["occurredAt"][:10] <= end_date
    ]
    income_tx = [t for t in period_tx if t["txType"] == "INCOME"]
    refund_tx = [t for t in period_tx if t["txType"] == "REFUND"]
    expense_tx = [t for t in period_tx if t["txType"] == "EXPENSE"]

    gross_income = sum(t["amountPaise"] for t in income_tx)
    total_refunds = sum(t["amountPaise"] for t in refund_tx)
    total_revenue = max(0, gross_income - total_refunds)
    total_expenses = sum(t["amountPaise"] for t in expense_tx)
    net_profit = total_revenue - total_expenses

    tax_collected = sum(t["taxPaise"] for t in income_tx)
    input_tax_credit = sum(t["taxPaise"] for t in expense_tx)
    net_tax_payable = max(0, tax_collected - input_tax_credit)

    rev_by_source: dict[str, int] = {
        "COURTS": 0,
        "SHOP": 0,
        "BAR": 0,
        "MEMBERSHIPS": 0,
        "CORPORATE_INVOICE": 0,
    }
    rev_by_method: dict[str, int] = {
        "CASH": 0,
        "CARD": 0,
        "UPI": 0,
        "ONLINE": 0,
        "BANK_TRANSFER": 0,
    }
    for t in income_tx:
        src = t["source"]
        rev_by_source[src] = rev_by_source.get(src, 0) + t["amountPaise"]
        meth = t["paymentMethod"]
        rev_by_method[meth] = rev_by_method.get(meth, 0) + t["amountPaise"]

    daily_map: dict[str, dict[str, Any]] = {}
    cursor = start_date
    while cursor <= end_date:
        daily_map[cursor] = {"date": cursor, "revenue": 0, "expenses": 0}
        cursor = add_days_to_date_str(cursor, 1)

    for t in income_tx:
        d = t["occurredAt"][:10]
        if d in daily_map:
            daily_map[d]["revenue"] += round(t["amountPaise"] / 100)
    for t in expense_tx:
        d = t["occurredAt"][:10]
        if d in daily_map:
            daily_map[d]["expenses"] += round(t["amountPaise"] / 100)

    all_courts = db.fetch_all("SELECT * FROM courts WHERE is_active = 1")
    all_bookings = [
        b
        for b in db.fetch_all("SELECT * FROM bookings WHERE status != 'CANCELLED'")
        if start_date <= b["bookingDate"] <= end_date
    ]
    num_days = max(1, len(daily_map))
    total_available_hours = len(all_courts) * 16 * num_days
    court_utilisation_pct = round(
        (len(all_bookings) / (total_available_hours or 1)) * 100, 1
    )

    # Heatmap Mon..Sun
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    heatmap_buckets: dict[str, int] = {}
    for b in all_bookings:
        dt = datetime.strptime(b["bookingDate"], "%Y-%m-%d")
        day_label = day_names[dt.weekday()]
        hour_str = b["startTime"][11:13]
        key = f"{day_label}-{hour_str}"
        heatmap_buckets[key] = heatmap_buckets.get(key, 0) + 1

    all_members = db.fetch_all("SELECT * FROM members")
    active_cnt = sum(1 for m in all_members if m["status"] == "ACTIVE")
    expiring_soon = [m for m in all_members if m["status"] == "EXPIRING_SOON"]
    expired_cnt = sum(1 for m in all_members if m["status"] == "EXPIRED")

    open_tabs = db.fetch_all("SELECT * FROM tabs WHERE status = 'OPEN'")
    open_tabs_due = sum(t["totalPaise"] - t["paidPaise"] for t in open_tabs)
    all_invoices = db.fetch_all("SELECT * FROM invoices")
    overdue_invoices = [
        i for i in all_invoices if i["status"] in ("OVERDUE", "SENT")
    ]
    invoices_due = sum(i["totalPaise"] - i["paidPaise"] for i in overdue_invoices)
    outstanding_dues = open_tabs_due + invoices_due

    payable_expenses = db.fetch_all(
        "SELECT * FROM expenses WHERE status = 'PAYABLE'"
    )
    payables_paise = sum(
        e["amountPaise"] + e["taxPaise"] for e in payable_expenses
    )

    shop_order_ids = {
        o["id"]
        for o in db.fetch_all(
            "SELECT id, status, created_at FROM shop_orders WHERE status != 'CANCELLED'"
        )
        if start_date <= o["createdAt"][:10] <= end_date
    }
    shop_items = [
        it
        for it in db.fetch_all("SELECT * FROM shop_order_items")
        if it["orderId"] in shop_order_ids
    ]
    top_shop_map: dict[str, dict[str, Any]] = {}
    for it in shop_items:
        name = it["productName"]
        if name not in top_shop_map:
            top_shop_map[name] = {"name": name, "qty": 0, "revenuePaise": 0}
        top_shop_map[name]["qty"] += it["quantity"]
        top_shop_map[name]["revenuePaise"] += it["lineTotalPaise"]

    bar_order_ids = {
        o["id"]
        for o in db.fetch_all(
            "SELECT id, kds_status, created_at FROM bar_orders WHERE kds_status != 'CANCELLED'"
        )
        if start_date <= o["createdAt"][:10] <= end_date
    }
    bar_items = [
        it
        for it in db.fetch_all("SELECT * FROM bar_order_items")
        if it["barOrderId"] in bar_order_ids
    ]
    top_bar_map: dict[str, dict[str, Any]] = {}
    for it in bar_items:
        name = it["itemName"]
        if name not in top_bar_map:
            top_bar_map[name] = {"name": name, "qty": 0, "revenuePaise": 0}
        top_bar_map[name]["qty"] += it["quantity"]
        top_bar_map[name]["revenuePaise"] += it["lineTotalPaise"]

    low_stock = get_low_stock_variants(db)
    pending_leaves = db.fetch_all(
        "SELECT id FROM leave_requests WHERE status = 'PENDING'"
    )

    return {
        "period": period,
        "startDate": start_date,
        "endDate": end_date,
        "kpis": {
            "totalRevenuePaise": total_revenue,
            "totalExpensesPaise": total_expenses,
            "netProfitPaise": net_profit,
            "taxCollectedPaise": tax_collected,
            "netTaxPayablePaise": net_tax_payable,
            "outstandingDuesPaise": outstanding_dues,
            "payablesPaise": payables_paise,
            "courtUtilisationPct": court_utilisation_pct,
            "activeMembersCount": active_cnt,
            "expiringSoonCount": len(expiring_soon),
            "expiredMembersCount": expired_cnt,
            "totalBookingsCount": len(all_bookings),
        },
        "revenueBySource": [
            {
                "source": src,
                "amountPaise": amt,
                "amountInr": round(amt / 100),
            }
            for src, amt in rev_by_source.items()
        ],
        "revenueByMethod": [
            {
                "method": meth,
                "amountPaise": amt,
                "amountInr": round(amt / 100),
            }
            for meth, amt in rev_by_method.items()
        ],
        "dailyTrend": list(daily_map.values()),
        "heatmapBuckets": heatmap_buckets,
        "topProducts": sorted(
            top_shop_map.values(), key=lambda x: x["revenuePaise"], reverse=True
        )[:5],
        "topBarItems": sorted(
            top_bar_map.values(), key=lambda x: x["revenuePaise"], reverse=True
        )[:5],
        "alerts": {
            "expiringMembers": expiring_soon[:8],
            "lowStockItems": low_stock[:8],
            "pendingLeavesCount": len(pending_leaves),
            "overdueInvoices": [
                i for i in overdue_invoices if i["status"] == "OVERDUE"
            ],
        },
    }


def create_share_report_token(
    period: str,
    start_date: str | None = None,
    end_date: str | None = None,
    user_id: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    token = secrets.token_hex(16)
    created_at = now_iso()
    expires_at = f"{add_days_to_date_str(to_ist_date_string(), 7)}T23:59:59+05:30"
    db.execute(
        """
        INSERT INTO share_tokens
          (token, period, start_date, end_date, created_by_user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (token, period, start_date, end_date, user_id, expires_at, created_at),
    )
    return {"token": token, "expiresAt": expires_at}


def get_shared_report_by_token(
    token: str, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    row = db.fetch_one("SELECT * FROM share_tokens WHERE token = ?", (token,))
    if not row:
        raise AppError(
            404, "REPORT_NOT_FOUND", "Shareable report link not found."
        )
    if parse_iso_ms(row["expiresAt"]) < now_ms():
        raise AppError(
            410, "REPORT_EXPIRED", "This shareable report link has expired."
        )
    return {
        "expiresAt": row["expiresAt"],
        "dashboard": get_owner_dashboard(
            row["period"], row.get("startDate"), row.get("endDate"), db
        ),
    }


def list_transactions(
    limit: int = 200, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    return db.fetch_all(
        "SELECT * FROM transactions ORDER BY id DESC LIMIT ?", (limit,)
    )


def list_expenses(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    return db.fetch_all("SELECT * FROM expenses ORDER BY id DESC")


def create_expense(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        created_at = now_iso()
        exp = db.insert_returning(
            """
            INSERT INTO expenses
              (category, vendor_name, description, amount_paise, tax_paise, expense_date,
               due_date, status, is_recurring, created_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            """,
            (
                data["category"],
                data["vendorName"],
                data["description"],
                data["amountPaise"],
                data.get("taxPaise", 0),
                data["expenseDate"],
                data.get("dueDate"),
                data.get("status", "PAID"),
                1 if data.get("isRecurring") else 0,
                data.get("actorUserId"),
                created_at,
            ),
        )
        if data.get("status", "PAID") == "PAID":
            db.execute(
                """
                INSERT INTO transactions
                  (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                VALUES ('EXPENSE', ?, 'BANK_TRANSFER', ?, ?, ?, 'EXPENSE', ?, ?)
                """,
                (
                    data["category"],
                    data["amountPaise"] + data.get("taxPaise", 0),
                    data.get("taxPaise", 0),
                    f"{data['vendorName']} — {data['description']}",
                    exp["id"],
                    f"{data['expenseDate']}T12:00:00+05:30",
                ),
            )
        return exp


def mark_expense_paid(
    expense_id: int, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        exp = db.fetch_one("SELECT * FROM expenses WHERE id = ?", (expense_id,))
        if not exp:
            raise AppError(404, "EXPENSE_NOT_FOUND", "Expense not found.")
        if exp["status"] == "PAID":
            raise AppError(400, "ALREADY_PAID", "Expense already paid.")
        db.execute(
            "UPDATE expenses SET status = 'PAID' WHERE id = ?", (expense_id,)
        )
        db.execute(
            """
            INSERT INTO transactions
              (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
            VALUES ('EXPENSE', ?, 'BANK_TRANSFER', ?, ?, ?, 'EXPENSE', ?, ?)
            """,
            (
                exp["category"],
                exp["amountPaise"] + exp["taxPaise"],
                exp["taxPaise"],
                f"{exp['vendorName']} — {exp['description']}",
                exp["id"],
                now_iso(),
            ),
        )
        return {**exp, "status": "PAID"}


def list_clients_and_invoices(
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    clients = db.fetch_all("SELECT * FROM clients ORDER BY company_name ASC")
    invoices = db.fetch_all("SELECT * FROM invoices ORDER BY id DESC")
    items = db.fetch_all("SELECT * FROM invoice_items")
    members = db.fetch_all("SELECT * FROM members")

    client_map = {c["id"]: c for c in clients}
    member_map = {m["id"]: m for m in members}
    items_by_inv: dict[int, list[dict[str, Any]]] = {}
    for it in items:
        items_by_inv.setdefault(it["invoiceId"], []).append(it)

    return {
        "clients": clients,
        "invoices": [
            {
                **inv,
                "client": client_map.get(inv["clientId"])
                if inv["clientId"]
                else None,
                "member": member_map.get(inv["memberId"])
                if inv["memberId"]
                else None,
                "items": items_by_inv.get(inv["id"], []),
            }
            for inv in invoices
        ],
    }


def create_corporate_client(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    return db.insert_returning(
        """
        INSERT INTO clients
          (company_name, contact_person, email, phone, gst_number, billing_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        """,
        (
            data["companyName"],
            data["contactPerson"],
            data["email"],
            data["phone"],
            data.get("gstNumber"),
            data["billingAddress"],
            now_iso(),
        ),
    )


def create_corporate_invoice(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        client = db.fetch_one(
            "SELECT * FROM clients WHERE id = ?", (data["clientId"],)
        )
        if not client:
            raise AppError(404, "CLIENT_NOT_FOUND", "Corporate client not found.")

        subtotal = 0
        tax = 0
        for it in data["items"]:
            line = it["quantity"] * it["unitPricePaise"]
            subtotal += line
            tax += round((line * it.get("taxRatePct", 18)) / 100)
        total = subtotal + tax

        cnt_row = db.fetch_one("SELECT COUNT(*) AS cnt FROM invoices")
        count = (cnt_row["cnt"] if cnt_row else 0) + 1
        inv_num = f"INV-2026-{count:03d}"
        today = to_ist_date_string()

        inv = db.insert_returning(
            """
            INSERT INTO invoices
              (invoice_number, invoice_type, client_id, issue_date, due_date, status,
               subtotal_paise, tax_paise, total_paise, paid_paise, notes, created_at)
            VALUES (?, 'CORPORATE', ?, ?, ?, 'SENT', ?, ?, ?, 0, ?, ?)
            RETURNING *
            """,
            (
                inv_num,
                client["id"],
                today,
                data["dueDate"],
                subtotal,
                tax,
                total,
                data.get("notes"),
                now_iso(),
            ),
        )

        for it in data["items"]:
            db.execute(
                """
                INSERT INTO invoice_items
                  (invoice_id, description, quantity, unit_price_paise, tax_rate_pct, line_total_paise)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    inv["id"],
                    it["description"],
                    it["quantity"],
                    it["unitPricePaise"],
                    it.get("taxRatePct", 18),
                    it["quantity"] * it["unitPricePaise"],
                ),
            )
        return inv


def record_invoice_payment(
    invoice_id: int,
    amount_paise: int,
    method: str,
    actor_user_id: int | None = None,
    actor_name: str | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        inv = db.fetch_one("SELECT * FROM invoices WHERE id = ?", (invoice_id,))
        if not inv:
            raise AppError(404, "INVOICE_NOT_FOUND", "Invoice not found.")
        remaining = inv["totalPaise"] - inv["paidPaise"]
        if amount_paise <= 0 or amount_paise > remaining:
            raise AppError(
                400,
                "INVALID_PAYMENT",
                f"Payment must be between 1 and remaining balance ({remaining}).",
            )

        new_paid = inv["paidPaise"] + amount_paise
        next_status = "PAID" if new_paid >= inv["totalPaise"] else inv["status"]
        paid_at = now_iso()

        db.execute(
            "UPDATE invoices SET paid_paise = ?, status = ? WHERE id = ?",
            (new_paid, next_status, invoice_id),
        )
        db.execute(
            """
            INSERT INTO payments
              (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
            VALUES ('INVOICE', ?, ?, ?, ?, 'SUCCESS', ?, ?)
            """,
            (inv["id"], inv["memberId"], amount_paise, method, actor_user_id, paid_at),
        )
        db.execute(
            """
            INSERT INTO transactions
              (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
            VALUES ('INCOME', ?, ?, ?, ?, ?, 'INVOICE', ?, ?)
            """,
            (
                "CORPORATE_INVOICE"
                if inv["invoiceType"] == "CORPORATE"
                else "MEMBERSHIPS",
                method,
                amount_paise,
                round((inv["taxPaise"] * amount_paise) / (inv["totalPaise"] or 1)),
                f"Invoice {inv['invoiceNumber']} Payment",
                inv["id"],
                paid_at,
            ),
        )
        db.execute(
            """
            INSERT INTO audit_logs
              (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
            VALUES (?, ?, 'INVOICE_PAID', 'INVOICE', ?, ?, ?)
            """,
            (
                actor_user_id,
                actor_name or "Staff",
                str(inv["id"]),
                json.dumps({
                    "invoiceNumber": inv["invoiceNumber"],
                    "amountPaise": amount_paise,
                    "method": method,
                }),
                paid_at,
            ),
        )
        return {**inv, "paidPaise": new_paid, "status": next_status}


def get_hr_overview(db: Database | None = None) -> dict[str, Any]:
    db = db or get_db()
    employees = db.fetch_all(
        "SELECT * FROM employees ORDER BY employee_code ASC"
    )
    shifts = db.fetch_all("SELECT * FROM shifts ORDER BY shift_date DESC")
    attendance = db.fetch_all(
        "SELECT * FROM attendance ORDER BY work_date DESC"
    )
    leaves = db.fetch_all("SELECT * FROM leave_requests ORDER BY id DESC")
    payroll_runs = db.fetch_all(
        "SELECT * FROM payroll_runs ORDER BY id DESC"
    )
    payslips = db.fetch_all("SELECT * FROM payslips")

    emp_map = {e["id"]: e for e in employees}
    slips_by_run: dict[int, list[dict[str, Any]]] = {}
    for ps in payslips:
        emp = emp_map.get(ps["employeeId"])
        slips_by_run.setdefault(ps["payrollRunId"], []).append({
            **ps,
            "employeeName": emp["fullName"] if emp else "Staff",
            "employeeCode": emp["employeeCode"] if emp else "",
            "designation": emp["designation"] if emp else "",
        })

    return {
        "employees": employees,
        "shifts": [
            {
                **s,
                "employeeName": emp_map.get(s["employeeId"], {}).get(
                    "fullName", "Staff"
                ),
            }
            for s in shifts
        ],
        "attendance": [
            {
                **a,
                "employeeName": emp_map.get(a["employeeId"], {}).get(
                    "fullName", "Staff"
                ),
            }
            for a in attendance
        ],
        "leaveRequests": [
            {
                **l,
                "employeeName": emp_map.get(l["employeeId"], {}).get(
                    "fullName", "Staff"
                ),
                "department": emp_map.get(l["employeeId"], {}).get(
                    "department", ""
                ),
            }
            for l in leaves
        ],
        "payrollRuns": [
            {
                **pr,
                "payslips": slips_by_run.get(pr["id"], []),
            }
            for pr in payroll_runs
        ],
    }


def create_shift(data: dict[str, Any], db: Database | None = None) -> dict[str, Any]:
    db = db or get_db()
    return db.insert_returning(
        """
        INSERT INTO shifts
          (employee_id, shift_date, shift_type, start_time, end_time, station)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
        """,
        (
            data["employeeId"],
            data["shiftDate"],
            data["shiftType"],
            data["startTime"],
            data["endTime"],
            data["station"],
        ),
    )


def create_leave_request(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    emp = db.fetch_one(
        "SELECT * FROM employees WHERE id = ?", (data["employeeId"],)
    )
    if not emp:
        raise AppError(404, "EMPLOYEE_NOT_FOUND", "Employee not found.")

    lr = db.insert_returning(
        """
        INSERT INTO leave_requests
          (employee_id, leave_type, start_date, end_date, days_count, reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
        RETURNING *
        """,
        (
            data["employeeId"],
            data["leaveType"],
            data["startDate"],
            data["endDate"],
            data["daysCount"],
            data["reason"],
            now_iso(),
        ),
    )
    db.execute(
        """
        INSERT INTO notifications
          (target_role, channel, title, body, is_read, created_at)
        VALUES ('MANAGER', 'IN_APP', ?, ?, 0, ?)
        """,
        (
            f"Leave Request: {emp['fullName']}",
            f"{data['daysCount']} day(s) {data['leaveType']} leave starting {data['startDate']}.",
            now_iso(),
        ),
    )
    return lr


def review_leave_request(
    leave_id: int,
    decision: str,
    reviewer_user_id: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        lr = db.fetch_one(
            "SELECT * FROM leave_requests WHERE id = ?", (leave_id,)
        )
        if not lr:
            raise AppError(404, "LEAVE_NOT_FOUND", "Leave request not found.")
        if lr["status"] != "PENDING":
            raise AppError(
                400, "ALREADY_REVIEWED", "Leave request already reviewed."
            )

        db.execute(
            """
            UPDATE leave_requests
            SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?
            WHERE id = ?
            """,
            (decision, reviewer_user_id, now_iso(), leave_id),
        )
        if decision == "APPROVED":
            emp = db.fetch_one(
                "SELECT * FROM employees WHERE id = ?", (lr["employeeId"],)
            )
            if emp:
                db.execute(
                    "UPDATE employees SET leave_balance_days = ? WHERE id = ?",
                    (max(0, emp["leaveBalanceDays"] - lr["daysCount"]), emp["id"]),
                )
        return {**lr, "status": decision}


def run_monthly_payroll(
    pay_month: str,
    actor_user_id: int | None = None,
    actor_name: str | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        existing = db.fetch_one(
            "SELECT * FROM payroll_runs WHERE pay_month = ?", (pay_month,)
        )
        if existing:
            raise AppError(
                409,
                "PAYROLL_ALREADY_RUN",
                f"Payroll for {pay_month} has already been processed.",
            )

        active_emps = db.fetch_all(
            "SELECT * FROM employees WHERE is_active = 1"
        )
        total_gross = 0
        total_deductions = 0
        total_net = 0
        slips: list[dict[str, int]] = []

        for emp in active_emps:
            base = emp["monthlySalaryPaise"]
            overtime = 0
            deductions = round(base * 0.08)
            net = base + overtime - deductions
            total_gross += base + overtime
            total_deductions += deductions
            total_net += net
            slips.append({
                "empId": emp["id"],
                "base": base,
                "overtime": overtime,
                "deductions": deductions,
                "net": net,
            })

        processed_at = now_iso()
        run_row = db.insert_returning(
            """
            INSERT INTO payroll_runs
              (pay_month, total_gross_paise, total_deductions_paise, total_net_paise,
               status, processed_by_user_id, processed_at)
            VALUES (?, ?, ?, ?, 'PROCESSED', ?, ?)
            RETURNING *
            """,
            (
                pay_month,
                total_gross,
                total_deductions,
                total_net,
                actor_user_id,
                processed_at,
            ),
        )

        for s in slips:
            db.execute(
                """
                INSERT INTO payslips
                  (payroll_run_id, employee_id, base_salary_paise, overtime_paise, deductions_paise, net_pay_paise)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_row["id"],
                    s["empId"],
                    s["base"],
                    s["overtime"],
                    s["deductions"],
                    s["net"],
                ),
            )

        exp = db.insert_returning(
            """
            INSERT INTO expenses
              (category, vendor_name, description, amount_paise, tax_paise, expense_date,
               status, is_recurring, created_by_user_id, created_at)
            VALUES ('SALARIES', 'Club Payroll', ?, ?, 0, ?, 'PAID', 1, ?, ?)
            RETURNING *
            """,
            (
                f"Monthly Staff Payroll ({pay_month})",
                total_net,
                processed_at[:10],
                actor_user_id,
                processed_at,
            ),
        )

        db.execute(
            """
            INSERT INTO transactions
              (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
            VALUES ('EXPENSE', 'SALARIES', 'BANK_TRANSFER', ?, 0, ?, 'EXPENSE', ?, ?)
            """,
            (
                total_net,
                f"Monthly Payroll Run ({pay_month})",
                exp["id"],
                processed_at,
            ),
        )

        db.execute(
            """
            INSERT INTO audit_logs
              (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
            VALUES (?, ?, 'PAYROLL_RUN', 'PAYROLL', ?, ?, ?)
            """,
            (
                actor_user_id,
                actor_name or "Owner",
                str(run_row["id"]),
                json.dumps({
                    "payMonth": pay_month,
                    "employees": len(active_emps),
                    "totalNetPaise": total_net,
                }),
                processed_at,
            ),
        )
        return run_row


def list_notifications(
    role: str | None = None,
    member_id: int | None = None,
    db: Database | None = None,
) -> list[dict[str, Any]]:
    db = db or get_db()
    all_rows = db.fetch_all(
        "SELECT * FROM notifications ORDER BY id DESC LIMIT 60"
    )
    out: list[dict[str, Any]] = []
    for n in all_rows:
        if member_id and n["memberId"] == member_id:
            out.append(n)
        elif role and n["targetRole"] == role:
            out.append(n)
        elif role in ("OWNER", "MANAGER") and n["targetRole"] != "MEMBER":
            out.append(n)
    return out


def mark_notification_read(
    notif_id: int, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    db.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ?", (notif_id,)
    )
    return {"ok": True}


def list_audit_logs(
    limit: int = 100, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    return db.fetch_all(
        "SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)
    )


def list_settings(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    return db.fetch_all("SELECT * FROM settings")


def update_setting(
    key: str,
    value: str,
    actor_user_id: int | None = None,
    actor_name: str | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    existing = db.fetch_one("SELECT * FROM settings WHERE key = ?", (key,))
    if not existing:
        raise AppError(404, "SETTING_NOT_FOUND", "Setting key not found.")
    updated_at = now_iso()
    db.execute(
        "UPDATE settings SET value = ?, updated_at = ? WHERE key = ?",
        (value, updated_at, key),
    )
    db.execute(
        """
        INSERT INTO audit_logs
          (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, 'SETTING_UPDATED', 'SETTING', ?, ?, ?)
        """,
        (
            actor_user_id,
            actor_name or "Owner",
            key,
            json.dumps({"oldValue": existing["value"], "newValue": value}),
            updated_at,
        ),
    )
    return {"key": key, "value": value, "updatedAt": updated_at}
