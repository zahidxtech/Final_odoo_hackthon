from __future__ import annotations

from typing import Any

from ..db import Database, get_db
from ..errors import AppError
from ..time_utils import now_iso, to_ist_date_string
from .membership_service import get_member_with_plan


def list_menu_items(
    include_unavailable: bool = True, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    if include_unavailable:
        return db.fetch_all(
            "SELECT * FROM menu_items ORDER BY category ASC, name ASC"
        )
    return db.fetch_all(
        "SELECT * FROM menu_items WHERE is_available = 1 ORDER BY category ASC, name ASC"
    )


def toggle_menu_item_availability(
    item_id: int, is_available: bool, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    existing = db.fetch_one("SELECT * FROM menu_items WHERE id = ?", (item_id,))
    if not existing:
        raise AppError(404, "MENU_ITEM_NOT_FOUND", "Menu item not found.")
    db.execute(
        "UPDATE menu_items SET is_available = ? WHERE id = ?",
        (1 if is_available else 0, item_id),
    )
    updated = db.fetch_one("SELECT * FROM menu_items WHERE id = ?", (item_id,))
    assert updated is not None
    return updated


def list_bar_tables(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    tables = db.fetch_all("SELECT * FROM bar_tables ORDER BY id ASC")
    members = db.fetch_all("SELECT id, full_name, member_code FROM members")
    open_orders = db.fetch_all(
        "SELECT table_id, total_paise FROM bar_orders WHERE billing_status = 'UNPAID'"
    )
    member_map = {m["id"]: m for m in members}

    out: list[dict[str, Any]] = []
    for t in tables:
        mem = member_map.get(t["currentMemberId"]) if t["currentMemberId"] else None
        unpaid_total = sum(
            o["totalPaise"] for o in open_orders if o["tableId"] == t["id"]
        )
        out.append({
            **t,
            "memberName": mem["fullName"] if mem else None,
            "memberCode": mem["memberCode"] if mem else None,
            "unpaidTotalPaise": unpaid_total,
        })
    return out


def update_table_status(
    table_id: int, data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    table = db.fetch_one("SELECT * FROM bar_tables WHERE id = ?", (table_id,))
    if not table:
        raise AppError(404, "TABLE_NOT_FOUND", "Table not found.")

    status = data["status"]
    if status == "FREE":
        next_member_id = None
        next_opened_at = None
    else:
        next_member_id = (
            data.get("memberId")
            if data.get("memberId") is not None
            else table["currentMemberId"]
        )
        next_opened_at = table["openedAt"] or now_iso()

    db.execute(
        """
        UPDATE bar_tables
        SET status = ?, current_member_id = ?, opened_at = ?
        WHERE id = ?
        """,
        (status, next_member_id, next_opened_at, table_id),
    )
    updated = db.fetch_one("SELECT * FROM bar_tables WHERE id = ?", (table_id,))
    assert updated is not None
    return updated


def transfer_or_merge_table(
    from_table_id: int, to_table_id: int, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    if from_table_id == to_table_id:
        raise AppError(
            400, "SAME_TABLE", "Source and destination tables must differ."
        )

    with db.immediate_tx():
        from_table = db.fetch_one(
            "SELECT * FROM bar_tables WHERE id = ?", (from_table_id,)
        )
        to_table = db.fetch_one(
            "SELECT * FROM bar_tables WHERE id = ?", (to_table_id,)
        )
        if not from_table or not to_table:
            raise AppError(404, "TABLE_NOT_FOUND", "Table not found.")

        db.execute(
            """
            UPDATE bar_orders
            SET table_id = ?
            WHERE table_id = ? AND billing_status = 'UNPAID'
            """,
            (to_table_id, from_table_id),
        )

        next_status = (
            "OCCUPIED" if to_table["status"] == "FREE" else to_table["status"]
        )
        next_member = (
            to_table["currentMemberId"]
            if to_table["currentMemberId"] is not None
            else from_table["currentMemberId"]
        )
        next_opened = (
            to_table["openedAt"] or from_table["openedAt"] or now_iso()
        )

        db.execute(
            """
            UPDATE bar_tables
            SET status = ?, current_member_id = ?, opened_at = ?
            WHERE id = ?
            """,
            (next_status, next_member, next_opened, to_table_id),
        )
        db.execute(
            """
            UPDATE bar_tables
            SET status = 'FREE', current_member_id = NULL, opened_at = NULL
            WHERE id = ?
            """,
            (from_table_id,),
        )

        return {
            "transferred": True,
            "fromTableId": from_table_id,
            "toTableId": to_table_id,
        }


def get_bar_order_by_id(
    order_id: int, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    order = db.fetch_one("SELECT * FROM bar_orders WHERE id = ?", (order_id,))
    if not order:
        raise AppError(404, "BAR_ORDER_NOT_FOUND", "Bar order not found.")
    items = db.fetch_all(
        "SELECT * FROM bar_order_items WHERE bar_order_id = ?", (order["id"],)
    )
    table = (
        db.fetch_one(
            "SELECT table_number FROM bar_tables WHERE id = ?", (order["tableId"],)
        )
        if order["tableId"]
        else None
    )
    member = (
        db.fetch_one(
            "SELECT full_name FROM members WHERE id = ?", (order["memberId"],)
        )
        if order["memberId"]
        else None
    )
    return {
        **order,
        "items": items,
        "tableNumber": table["tableNumber"] if table else None,
        "memberName": member["fullName"] if member else None,
    }


def create_bar_order(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    items_input = data.get("items") or []
    if len(items_input) == 0:
        raise AppError(400, "EMPTY_ORDER", "At least one menu item is required.")

    with db.immediate_tx():
        bar_discount_pct = 0
        member_id = data.get("memberId")
        if member_id:
            m = get_member_with_plan(member_id, db)
            if m["status"] not in ("EXPIRED", "CANCELLED") and m.get("plan"):
                bar_discount_pct = m["plan"]["barDiscountPct"]

        subtotal_paise = 0
        prepared: list[dict[str, Any]] = []
        for item in items_input:
            menu_item = db.fetch_one(
                "SELECT * FROM menu_items WHERE id = ?", (item["menuItemId"],)
            )
            if not menu_item or not menu_item["isAvailable"]:
                raise AppError(
                    400,
                    "ITEM_UNAVAILABLE",
                    f"Menu item #{item['menuItemId']} is unavailable.",
                )
            line_total = menu_item["pricePaise"] * item["quantity"]
            subtotal_paise += line_total
            prepared.append({
                "menuItem": menu_item,
                "quantity": item["quantity"],
                "lineTotalPaise": line_total,
                "notes": item.get("notes"),
            })

        discount_paise = round((subtotal_paise * bar_discount_pct) / 100)
        discounted_subtotal = subtotal_paise - discount_paise
        total_tax_paise = round((discounted_subtotal * 5) / 100)
        total_paise = discounted_subtotal + total_tax_paise
        created_at = now_iso()

        tab_id: int | None = None
        billing_status = "UNPAID"

        if data.get("chargeToTab"):
            if not member_id:
                raise AppError(
                    400,
                    "MEMBER_REQUIRED_FOR_TAB",
                    "A member must be selected to charge to a tab.",
                )
            open_tab = db.fetch_one(
                "SELECT * FROM tabs WHERE member_id = ? AND status = 'OPEN' LIMIT 1",
                (member_id,),
            )
            if not open_tab:
                open_tab = db.insert_returning(
                    """
                    INSERT INTO tabs
                      (member_id, status, subtotal_paise, discount_paise, tax_paise, total_paise, paid_paise, opened_at)
                    VALUES (?, 'OPEN', 0, 0, 0, 0, 0, ?)
                    RETURNING *
                    """,
                    (member_id, created_at),
                )
            tab_id = open_tab["id"]
            billing_status = "ON_TAB"
            db.execute(
                """
                UPDATE tabs
                SET subtotal_paise = ?, discount_paise = ?, tax_paise = ?, total_paise = ?
                WHERE id = ?
                """,
                (
                    open_tab["subtotalPaise"] + subtotal_paise,
                    open_tab["discountPaise"] + discount_paise,
                    open_tab["taxPaise"] + total_tax_paise,
                    open_tab["totalPaise"] + total_paise,
                    open_tab["id"],
                ),
            )
        elif data.get("paymentMethod") or (
            data.get("splitPayments") and len(data["splitPayments"]) > 0
        ):
            billing_status = "PAID"

        cnt_row = db.fetch_one("SELECT COUNT(*) AS cnt FROM bar_orders")
        count = (cnt_row["cnt"] if cnt_row else 0) + 1
        order_number = f"BAR-{3000 + count}"

        table_id = data.get("tableId")
        staff_user_id = data.get("staffUserId")

        order = db.insert_returning(
            """
            INSERT INTO bar_orders
              (order_number, table_id, member_id, tab_id, staff_user_id,
               kds_status, billing_status, subtotal_paise, discount_paise,
               tax_paise, total_paise, notes, created_at)
            VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            """,
            (
                order_number,
                table_id,
                member_id,
                tab_id,
                staff_user_id,
                billing_status,
                subtotal_paise,
                discount_paise,
                total_tax_paise,
                total_paise,
                data.get("notes"),
                created_at,
            ),
        )

        for pi in prepared:
            mi = pi["menuItem"]
            db.execute(
                """
                INSERT INTO bar_order_items
                  (bar_order_id, menu_item_id, item_name, quantity, unit_price_paise, line_total_paise, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order["id"],
                    mi["id"],
                    mi["name"],
                    pi["quantity"],
                    mi["pricePaise"],
                    pi["lineTotalPaise"],
                    pi["notes"],
                ),
            )

        if table_id and billing_status != "PAID":
            db.execute(
                """
                UPDATE bar_tables
                SET status = 'OCCUPIED', current_member_id = ?, opened_at = ?
                WHERE id = ?
                """,
                (member_id, created_at, table_id),
            )

        if billing_status == "PAID":
            splits = (
                data["splitPayments"]
                if data.get("splitPayments") and len(data["splitPayments"]) > 0
                else [{"method": data.get("paymentMethod") or "CARD", "amountPaise": total_paise}]
            )
            split_sum = sum(s["amountPaise"] for s in splits)
            if split_sum != total_paise:
                raise AppError(
                    400,
                    "SPLIT_MISMATCH",
                    f"Split payments ({split_sum}) must equal order total ({total_paise}).",
                )
            for sp in splits:
                db.execute(
                    """
                    INSERT INTO payments
                      (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                    VALUES ('BAR_ORDER', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                    """,
                    (order["id"], member_id, sp["amountPaise"], sp["method"], staff_user_id, created_at),
                )
                db.execute(
                    """
                    INSERT INTO transactions
                      (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                    VALUES ('INCOME', 'BAR', ?, ?, ?, ?, 'BAR_ORDER', ?, ?)
                    """,
                    (
                        sp["method"],
                        sp["amountPaise"],
                        round((total_tax_paise * sp["amountPaise"]) / (total_paise or 1)),
                        f"Bar Order {order_number}",
                        order["id"],
                        created_at,
                    ),
                )

        return get_bar_order_by_id(order["id"], db)


def list_kds_orders(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    orders = db.fetch_all(
        "SELECT * FROM bar_orders ORDER BY id DESC LIMIT 80"
    )
    items = db.fetch_all("SELECT * FROM bar_order_items")
    tables = db.fetch_all("SELECT id, table_number FROM bar_tables")
    users = db.fetch_all("SELECT id, full_name FROM users")
    members = db.fetch_all("SELECT id, full_name FROM members")

    items_by_order: dict[int, list[dict[str, Any]]] = {}
    for it in items:
        items_by_order.setdefault(it["barOrderId"], []).append(it)
    table_map = {t["id"]: t["tableNumber"] for t in tables}
    user_map = {u["id"]: u["fullName"] for u in users}
    member_map = {m["id"]: m["fullName"] for m in members}

    return [
        {
            **o,
            "items": items_by_order.get(o["id"], []),
            "tableNumber": table_map.get(o["tableId"]) if o["tableId"] else None,
            "staffName": user_map.get(o["staffUserId"], "Staff")
            if o["staffUserId"]
            else "Counter",
            "memberName": member_map.get(o["memberId"]) if o["memberId"] else None,
        }
        for o in orders
    ]


def update_kds_status(
    order_id: int, kds_status: str, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    order = db.fetch_one("SELECT * FROM bar_orders WHERE id = ?", (order_id,))
    if not order:
        raise AppError(404, "BAR_ORDER_NOT_FOUND", "Bar order not found.")
    served_at = now_iso() if kds_status == "SERVED" else order["servedAt"]
    db.execute(
        "UPDATE bar_orders SET kds_status = ?, served_at = ? WHERE id = ?",
        (kds_status, served_at, order_id),
    )
    return get_bar_order_by_id(order_id, db)


def settle_table_orders(
    table_id: int,
    payments_input: list[dict[str, Any]],
    staff_user_id: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        unpaid = db.fetch_all(
            "SELECT * FROM bar_orders WHERE table_id = ? AND billing_status = 'UNPAID'",
            (table_id,),
        )
        if not unpaid:
            raise AppError(
                400, "NO_UNPAID_ORDERS", "No unpaid orders on this table."
            )

        total_due = sum(o["totalPaise"] for o in unpaid)
        total_tax = sum(o["taxPaise"] for o in unpaid)
        paid_sum = sum(p["amountPaise"] for p in payments_input)
        if paid_sum != total_due:
            raise AppError(
                400,
                "PAYMENT_MISMATCH",
                f"Payment sum ({paid_sum}) must equal table total ({total_due}).",
            )

        paid_at = now_iso()
        for ord_row in unpaid:
            db.execute(
                "UPDATE bar_orders SET billing_status = 'PAID' WHERE id = ?",
                (ord_row["id"],),
            )

        order_nums = ", ".join(u["orderNumber"] for u in unpaid)
        for p in payments_input:
            db.execute(
                """
                INSERT INTO payments
                  (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                VALUES ('BAR_ORDER', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                """,
                (
                    unpaid[0]["id"],
                    unpaid[0]["memberId"],
                    p["amountPaise"],
                    p["method"],
                    staff_user_id,
                    paid_at,
                ),
            )
            db.execute(
                """
                INSERT INTO transactions
                  (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                VALUES ('INCOME', 'BAR', ?, ?, ?, ?, 'BAR_ORDER', ?, ?)
                """,
                (
                    p["method"],
                    p["amountPaise"],
                    round((total_tax * p["amountPaise"]) / (total_due or 1)),
                    f"Table Settlement ({order_nums})",
                    unpaid[0]["id"],
                    paid_at,
                ),
            )

        db.execute(
            """
            UPDATE bar_tables
            SET status = 'FREE', current_member_id = NULL, opened_at = NULL
            WHERE id = ?
            """,
            (table_id,),
        )
        return {"settledOrders": len(unpaid), "totalPaidPaise": total_due}


def list_tabs(
    status: str | None = None, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    all_tabs = db.fetch_all("SELECT * FROM tabs ORDER BY id DESC")
    members = db.fetch_all("SELECT id, full_name, member_code FROM members")
    orders = db.fetch_all("SELECT * FROM bar_orders")
    items = db.fetch_all("SELECT * FROM bar_order_items")

    mem_map = {m["id"]: m for m in members}
    items_by_ord: dict[int, list[dict[str, Any]]] = {}
    for it in items:
        items_by_ord.setdefault(it["barOrderId"], []).append(it)
    orders_by_tab: dict[int, list[dict[str, Any]]] = {}
    for o in orders:
        if o["tabId"] is not None:
            orders_by_tab.setdefault(o["tabId"], []).append({
                **o,
                "items": items_by_ord.get(o["id"], []),
            })

    out: list[dict[str, Any]] = []
    for t in all_tabs:
        if status and status != "ALL" and t["status"] != status:
            continue
        m = mem_map.get(t["memberId"])
        out.append({
            **t,
            "balanceDuePaise": max(0, t["totalPaise"] - t["paidPaise"]),
            "memberName": m["fullName"] if m else "Member",
            "memberCode": m["memberCode"] if m else "",
            "orders": orders_by_tab.get(t["id"], []),
        })
    return out


def settle_tab(
    tab_id: int,
    payments_input: list[dict[str, Any]],
    staff_user_id: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        tab = db.fetch_one("SELECT * FROM tabs WHERE id = ?", (tab_id,))
        if not tab:
            raise AppError(404, "TAB_NOT_FOUND", "Member tab not found.")
        if tab["status"] == "SETTLED":
            raise AppError(400, "ALREADY_SETTLED", "Tab is already settled.")

        balance_due = tab["totalPaise"] - tab["paidPaise"]
        pay_sum = sum(p["amountPaise"] for p in payments_input)
        if pay_sum <= 0 or pay_sum > balance_due:
            raise AppError(
                400,
                "INVALID_PAYMENT_AMOUNT",
                f"Payment amount must be between 1 and balance due ({balance_due}).",
            )

        settled_at = now_iso()
        new_paid = tab["paidPaise"] + pay_sum
        is_now_settled = new_paid >= tab["totalPaise"]
        next_status = "SETTLED" if is_now_settled else "OPEN"

        db.execute(
            """
            UPDATE tabs
            SET paid_paise = ?, status = ?, settled_at = ?
            WHERE id = ?
            """,
            (new_paid, next_status, settled_at if is_now_settled else None, tab_id),
        )
        if is_now_settled:
            db.execute(
                "UPDATE bar_orders SET billing_status = 'PAID' WHERE tab_id = ?",
                (tab_id,),
            )

        for p in payments_input:
            db.execute(
                """
                INSERT INTO payments
                  (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
                VALUES ('TAB', ?, ?, ?, ?, 'SUCCESS', ?, ?)
                """,
                (tab["id"], tab["memberId"], p["amountPaise"], p["method"], staff_user_id, settled_at),
            )
            db.execute(
                """
                INSERT INTO transactions
                  (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                VALUES ('INCOME', 'BAR', ?, ?, ?, ?, 'TAB', ?, ?)
                """,
                (
                    p["method"],
                    p["amountPaise"],
                    round((tab["taxPaise"] * p["amountPaise"]) / (tab["totalPaise"] or 1)),
                    f"Member Tab #{tab['id']} Settlement",
                    tab["id"],
                    settled_at,
                ),
            )

        return {
            "tabId": tab["id"],
            "paidPaise": new_paid,
            "balanceDuePaise": tab["totalPaise"] - new_paid,
            "status": next_status,
        }


def get_daily_bar_closing_report(
    date_str: str | None = None, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    target_date = date_str or to_ist_date_string()

    all_orders = db.fetch_all("SELECT * FROM bar_orders")
    day_orders = [
        o
        for o in all_orders
        if o["createdAt"].startswith(target_date) and o["kdsStatus"] != "CANCELLED"
    ]

    all_payments = db.fetch_all("SELECT * FROM payments")
    day_bar_payments = [
        p
        for p in all_payments
        if p["paidAt"].startswith(target_date)
        and p["status"] == "SUCCESS"
        and p["referenceType"] in ("BAR_ORDER", "TAB")
    ]

    by_method: dict[str, int] = {"CASH": 0, "CARD": 0, "UPI": 0}
    for p in day_bar_payments:
        by_method[p["method"]] = by_method.get(p["method"], 0) + p["amountPaise"]

    total_collected = sum(p["amountPaise"] for p in day_bar_payments)
    total_billed = sum(o["totalPaise"] for o in day_orders)
    total_discounts = sum(o["discountPaise"] for o in day_orders)
    total_tax = sum(o["taxPaise"] for o in day_orders)

    open_tabs = db.fetch_all("SELECT * FROM tabs WHERE status = 'OPEN'")
    outstanding_tab = sum(t["totalPaise"] - t["paidPaise"] for t in open_tabs)

    day_order_ids = {o["id"] for o in day_orders}
    all_items = db.fetch_all("SELECT * FROM bar_order_items")
    day_items = [it for it in all_items if it["barOrderId"] in day_order_ids]

    item_totals: dict[str, dict[str, Any]] = {}
    for it in day_items:
        name = it["itemName"]
        if name not in item_totals:
            item_totals[name] = {"name": name, "quantity": 0, "revenuePaise": 0}
        item_totals[name]["quantity"] += it["quantity"]
        item_totals[name]["revenuePaise"] += it["lineTotalPaise"]

    users = db.fetch_all("SELECT id, full_name FROM users")
    user_map = {u["id"]: u["fullName"] for u in users}
    by_staff: dict[str, dict[str, Any]] = {}
    for o in day_orders:
        key = str(o["staffUserId"] or 0)
        if key not in by_staff:
            by_staff[key] = {
                "staffName": user_map.get(o["staffUserId"], "Counter / Self")
                if o["staffUserId"]
                else "Counter / Self",
                "orderCount": 0,
                "salesPaise": 0,
            }
        by_staff[key]["orderCount"] += 1
        by_staff[key]["salesPaise"] += o["totalPaise"]

    top_items = sorted(
        item_totals.values(), key=lambda x: x["revenuePaise"], reverse=True
    )[:10]
    staff_list = sorted(
        by_staff.values(), key=lambda x: x["salesPaise"], reverse=True
    )

    return {
        "date": target_date,
        "orderCount": len(day_orders),
        "totalBilledPaise": total_billed,
        "totalCollectedPaise": total_collected,
        "totalDiscountsPaise": total_discounts,
        "totalTaxPaise": total_tax,
        "outstandingTabBalancePaise": outstanding_tab,
        "byPaymentMethod": by_method,
        "topItems": top_items,
        "byStaff": staff_list,
    }
