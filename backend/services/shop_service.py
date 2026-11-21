from __future__ import annotations

import json
from typing import Any

from ..db import Database, get_db
from ..errors import AppError
from ..time_utils import now_iso
from .membership_service import get_member_with_plan


def list_products(
    filters: dict[str, Any] | None = None, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    f = filters or {}
    prods = db.fetch_all(
        "SELECT * FROM products WHERE is_active = 1 ORDER BY id DESC"
    )
    variants = db.fetch_all("SELECT * FROM product_variants")
    by_prod: dict[int, list[dict[str, Any]]] = {}
    for v in variants:
        by_prod.setdefault(v["productId"], []).append(v)

    category = f.get("category")
    search = (f.get("search") or "").lower()
    low_only = bool(f.get("lowStockOnly"))

    out: list[dict[str, Any]] = []
    for p in prods:
        p_vars = by_prod.get(p["id"], [])
        total_stock = sum(v["stockQty"] for v in p_vars)
        is_low_stock = any(v["stockQty"] <= p["reorderLevel"] for v in p_vars)

        if category and category != "ALL" and p["category"] != category.upper():
            continue
        if low_only and not is_low_stock:
            continue
        if search and (
            search not in p["name"].lower()
            and search not in p["brand"].lower()
            and search not in p["sku"].lower()
        ):
            continue

        out.append({
            **p,
            "variants": p_vars,
            "totalStock": total_stock,
            "isLowStock": is_low_stock,
        })
    return out


def list_suppliers(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    return db.fetch_all("SELECT * FROM suppliers")


def get_low_stock_variants(db: Database | None = None) -> list[dict[str, Any]]:
    db = db or get_db()
    rows = db.fetch_all(
        """
        SELECT pv.id AS variantId, pv.sku AS sku, pv.size AS size, pv.color AS color,
               pv.stock_qty AS stockQty, p.id AS productId, p.name AS productName,
               p.category AS category, p.reorder_level AS reorderLevel
        FROM product_variants pv
        INNER JOIN products p ON pv.product_id = p.id
        WHERE pv.stock_qty <= p.reorder_level
        """
    )
    return rows


def get_shop_order_by_id(
    order_id: int, db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    order = db.fetch_one(
        "SELECT * FROM shop_orders WHERE id = ?", (order_id,)
    )
    if not order:
        raise AppError(404, "ORDER_NOT_FOUND", "Shop order not found.")
    items = db.fetch_all(
        "SELECT * FROM shop_order_items WHERE order_id = ?", (order["id"],)
    )
    delivery = db.fetch_one(
        "SELECT * FROM delivery_info WHERE order_id = ?", (order["id"],)
    )
    return {**order, "items": items, "delivery": delivery}


def create_shop_order(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    items_input = data.get("items") or []
    if len(items_input) == 0:
        raise AppError(
            400, "EMPTY_CART", "At least one item is required to place an order."
        )

    with db.immediate_tx():
        shop_discount_pct = 0
        member_id = data.get("memberId")
        if member_id:
            m = get_member_with_plan(member_id, db)
            if m["status"] not in ("EXPIRED", "CANCELLED") and m.get("plan"):
                shop_discount_pct = m["plan"]["shopDiscountPct"]

        subtotal_paise = 0
        prepared: list[dict[str, Any]] = []

        for item in items_input:
            qty = item["quantity"]
            if qty <= 0:
                raise AppError(400, "INVALID_QUANTITY", "Quantity must be positive.")
            variant = db.fetch_one(
                "SELECT * FROM product_variants WHERE id = ?", (item["variantId"],)
            )
            if not variant:
                raise AppError(
                    404,
                    "VARIANT_NOT_FOUND",
                    f"Product variant #{item['variantId']} not found.",
                )
            product = db.fetch_one(
                "SELECT * FROM products WHERE id = ?", (variant["productId"],)
            )
            if not product:
                raise AppError(404, "PRODUCT_NOT_FOUND", "Product not found.")

            if variant["stockQty"] < qty:
                raise AppError(
                    409,
                    "INSUFFICIENT_STOCK",
                    f"Insufficient stock for {product['name']} ({variant['size']}): requested {qty}, available {variant['stockQty']}.",
                )

            unit_price = (
                variant["priceOverridePaise"]
                if variant["priceOverridePaise"] is not None
                else product["pricePaise"]
            )
            line_total = unit_price * qty
            subtotal_paise += line_total
            prepared.append({
                "variant": variant,
                "product": product,
                "quantity": qty,
                "unitPricePaise": unit_price,
                "lineTotalPaise": line_total,
            })

        discount_paise = round((subtotal_paise * shop_discount_pct) / 100)
        discounted_subtotal = subtotal_paise - discount_paise

        delivery_fee_paise = 0
        fulfilment_type = data.get("fulfilmentType", "PICKUP")
        delivery_addr = data.get("deliveryAddress")
        if fulfilment_type == "DELIVERY":
            if (
                not delivery_addr
                or not delivery_addr.get("addressLine")
                or not delivery_addr.get("city")
                or not delivery_addr.get("postalCode")
            ):
                raise AppError(
                    400,
                    "DELIVERY_ADDRESS_REQUIRED",
                    "Delivery address, city, and postal code are required.",
                )
            fee_set = db.fetch_one(
                "SELECT value FROM settings WHERE key = ?", ("delivery_fee_paise",)
            )
            free_set = db.fetch_one(
                "SELECT value FROM settings WHERE key = ?",
                ("free_delivery_threshold_paise",),
            )
            base_fee = int(fee_set["value"]) if fee_set else 10000
            free_thresh = int(free_set["value"]) if free_set else 250000
            delivery_fee_paise = (
                0 if discounted_subtotal >= free_thresh else base_fee
            )

        tax_paise = round((discounted_subtotal * 18) / 118)
        total_paise = discounted_subtotal + delivery_fee_paise
        created_at = now_iso()

        cnt_row = db.fetch_one("SELECT COUNT(*) AS cnt FROM shop_orders")
        order_count = (cnt_row["cnt"] if cnt_row else 0) + 1
        order_number = f"ORD-{2000 + order_count}"
        channel = data.get("channel", "ONLINE")
        initial_status = "COMPLETED" if channel == "POS" else "PLACED"
        payment_method = data.get("paymentMethod", "CARD")
        actor_user_id = data.get("actorUserId")
        customer_name = str(data["customerName"]).strip()

        order = db.insert_returning(
            """
            INSERT INTO shop_orders
              (order_number, member_id, customer_name, customer_phone, customer_email,
               channel, fulfilment_type, status, subtotal_paise, discount_paise,
               delivery_fee_paise, tax_paise, total_paise, payment_method, created_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            """,
            (
                order_number,
                member_id,
                customer_name,
                str(data["customerPhone"]).strip(),
                data.get("customerEmail"),
                channel,
                fulfilment_type,
                initial_status,
                subtotal_paise,
                discount_paise,
                delivery_fee_paise,
                tax_paise,
                total_paise,
                payment_method,
                actor_user_id,
                created_at,
            ),
        )

        for p_item in prepared:
            v = p_item["variant"]
            p = p_item["product"]
            db.execute(
                """
                INSERT INTO shop_order_items
                  (order_id, variant_id, product_name, variant_label, quantity, unit_price_paise, line_total_paise)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order["id"],
                    v["id"],
                    p["name"],
                    f"{v['size']} · {v['color']}",
                    p_item["quantity"],
                    p_item["unitPricePaise"],
                    p_item["lineTotalPaise"],
                ),
            )

            new_qty = v["stockQty"] - p_item["quantity"]
            db.execute(
                "UPDATE product_variants SET stock_qty = ? WHERE id = ?",
                (new_qty, v["id"]),
            )
            db.execute(
                """
                INSERT INTO stock_movements
                  (variant_id, movement_type, quantity_delta, reference_type, reference_id, reason, created_by_user_id, created_at)
                VALUES (?, ?, ?, 'SHOP_ORDER', ?, ?, ?, ?)
                """,
                (
                    v["id"],
                    "SALE_POS" if channel == "POS" else "SALE_ONLINE",
                    -p_item["quantity"],
                    order["id"],
                    f"{channel} Order {order_number}",
                    actor_user_id,
                    created_at,
                ),
            )

            if new_qty <= p["reorderLevel"]:
                db.execute(
                    """
                    INSERT INTO notifications
                      (target_role, channel, title, body, is_read, created_at)
                    VALUES ('SHOP_STAFF', 'IN_APP', ?, ?, 0, ?)
                    """,
                    (
                        f"Low Stock: {p['name']}",
                        f"Variant {v['sku']} ({v['size']}) dropped to {new_qty} units (reorder level {p['reorderLevel']}).",
                        created_at,
                    ),
                )

        if fulfilment_type == "DELIVERY" and delivery_addr:
            db.execute(
                """
                INSERT INTO delivery_info
                  (order_id, address_line, city, postal_code, delivery_notes, courier_name, tracking_code)
                VALUES (?, ?, ?, ?, ?, 'Alpha Sports Local Courier', ?)
                """,
                (
                    order["id"],
                    delivery_addr["addressLine"],
                    delivery_addr["city"],
                    delivery_addr["postalCode"],
                    delivery_addr.get("deliveryNotes"),
                    f"CC-DLV-{order['id']}",
                ),
            )

        db.execute(
            """
            INSERT INTO payments
              (reference_type, reference_id, member_id, amount_paise, method, status, received_by_user_id, paid_at)
            VALUES ('SHOP_ORDER', ?, ?, ?, ?, 'SUCCESS', ?, ?)
            """,
            (order["id"], member_id, total_paise, payment_method, actor_user_id, created_at),
        )
        db.execute(
            """
            INSERT INTO transactions
              (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
            VALUES ('INCOME', 'SHOP', ?, ?, ?, ?, 'SHOP_ORDER', ?, ?)
            """,
            (
                payment_method,
                total_paise,
                tax_paise,
                f"Pro Shop {order_number} ({channel}) — {customer_name}",
                order["id"],
                created_at,
            ),
        )

        return get_shop_order_by_id(order["id"], db)


def list_shop_orders(
    filters: dict[str, Any] | None = None, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    f = filters or {}
    orders = db.fetch_all("SELECT * FROM shop_orders ORDER BY id DESC")
    items = db.fetch_all("SELECT * FROM shop_order_items")
    deliveries = db.fetch_all("SELECT * FROM delivery_info")

    items_by_ord: dict[int, list[dict[str, Any]]] = {}
    for it in items:
        items_by_ord.setdefault(it["orderId"], []).append(it)
    deliv_by_ord = {d["orderId"]: d for d in deliveries}

    out: list[dict[str, Any]] = []
    for o in orders:
        if f.get("memberId") is not None and o["memberId"] != f["memberId"]:
            continue
        if f.get("status") and f["status"] != "ALL" and o["status"] != f["status"]:
            continue
        out.append({
            **o,
            "items": items_by_ord.get(o["id"], []),
            "delivery": deliv_by_ord.get(o["id"]),
        })
    return out


def update_shop_order_status(
    order_id: int,
    next_status: str,
    actor_user_id: int | None = None,
    actor_name: str | None = None,
    actor_role: str | None = None,
    actor_member_id: int | None = None,
    db: Database | None = None,
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        order = db.fetch_one("SELECT * FROM shop_orders WHERE id = ?", (order_id,))
        if not order:
            raise AppError(404, "ORDER_NOT_FOUND", "Order not found.")

        if actor_role == "MEMBER":
            if order["memberId"] != actor_member_id:
                raise AppError(403, "FORBIDDEN", "You may only cancel your own orders.")
            if next_status != "CANCELLED" or order["status"] not in ("PLACED", "CONFIRMED"):
                raise AppError(
                    400,
                    "CANNOT_CANCEL",
                    "Orders already dispatched or completed cannot be cancelled online.",
                )

        if order["status"] == "CANCELLED":
            raise AppError(400, "ALREADY_CANCELLED", "Order is already cancelled.")

        db.execute(
            "UPDATE shop_orders SET status = ? WHERE id = ?", (next_status, order_id)
        )

        if next_status == "CANCELLED":
            items = db.fetch_all(
                "SELECT * FROM shop_order_items WHERE order_id = ?", (order_id,)
            )
            created_at = now_iso()

            for item in items:
                variant = db.fetch_one(
                    "SELECT * FROM product_variants WHERE id = ?",
                    (item["variantId"],),
                )
                if variant:
                    db.execute(
                        "UPDATE product_variants SET stock_qty = ? WHERE id = ?",
                        (variant["stockQty"] + item["quantity"], variant["id"]),
                    )
                    db.execute(
                        """
                        INSERT INTO stock_movements
                          (variant_id, movement_type, quantity_delta, reference_type, reference_id, reason, created_by_user_id, created_at)
                        VALUES (?, 'RETURN_CANCEL', ?, 'SHOP_ORDER', ?, ?, ?, ?)
                        """,
                        (
                            variant["id"],
                            item["quantity"],
                            order["id"],
                            f"Cancelled Order {order['orderNumber']}",
                            actor_user_id,
                            created_at,
                        ),
                    )

            db.execute(
                """
                INSERT INTO transactions
                  (tx_type, source, payment_method, amount_paise, tax_paise, description, reference_type, reference_id, occurred_at)
                VALUES ('REFUND', 'SHOP', ?, ?, ?, ?, 'SHOP_ORDER', ?, ?)
                """,
                (
                    order["paymentMethod"],
                    order["totalPaise"],
                    order["taxPaise"],
                    f"Refund for Cancelled Order {order['orderNumber']}",
                    order["id"],
                    created_at,
                ),
            )

            db.execute(
                """
                INSERT INTO audit_logs
                  (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
                VALUES (?, ?, 'SHOP_ORDER_CANCELLED', 'SHOP_ORDER', ?, ?, ?)
                """,
                (
                    actor_user_id,
                    actor_name or "Staff",
                    str(order["id"]),
                    json.dumps({
                        "orderNumber": order["orderNumber"],
                        "refundedPaise": order["totalPaise"],
                    }),
                    created_at,
                ),
            )

        return get_shop_order_by_id(order_id, db)


def restock_or_adjust_variant(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        variant = db.fetch_one(
            "SELECT * FROM product_variants WHERE id = ?", (data["variantId"],)
        )
        if not variant:
            raise AppError(404, "VARIANT_NOT_FOUND", "Product variant not found.")

        next_qty = variant["stockQty"] + data["quantityDelta"]
        if next_qty < 0:
            raise AppError(
                400, "NEGATIVE_STOCK", "Stock quantity cannot drop below zero."
            )

        created_at = now_iso()
        db.execute(
            "UPDATE product_variants SET stock_qty = ? WHERE id = ?",
            (next_qty, variant["id"]),
        )
        movement_type = data["movementType"]
        db.execute(
            """
            INSERT INTO stock_movements
              (variant_id, supplier_id, movement_type, quantity_delta, unit_cost_paise,
               reference_type, reason, created_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                variant["id"],
                data.get("supplierId"),
                movement_type,
                data["quantityDelta"],
                data.get("unitCostPaise"),
                "PURCHASE" if movement_type == "RESTOCK" else "MANUAL",
                data["reason"],
                data.get("actorUserId"),
                created_at,
            ),
        )

        if (
            movement_type == "RESTOCK"
            and data.get("unitCostPaise")
            and data["quantityDelta"] > 0
        ):
            total_purchase = data["unitCostPaise"] * data["quantityDelta"]
            supplier = (
                db.fetch_one(
                    "SELECT * FROM suppliers WHERE id = ?", (data["supplierId"],)
                )
                if data.get("supplierId")
                else None
            )
            db.execute(
                """
                INSERT INTO expenses
                  (category, vendor_name, description, amount_paise, tax_paise, expense_date,
                   status, is_recurring, created_by_user_id, created_at)
                VALUES ('INVENTORY_PURCHASE', ?, ?, ?, ?, ?, 'PAID', 0, ?, ?)
                """,
                (
                    supplier["name"] if supplier else "Pro Shop Supplier",
                    f"Restock {variant['sku']} (+{data['quantityDelta']} units): {data['reason']}",
                    total_purchase,
                    round(total_purchase * 0.18),
                    created_at[:10],
                    data.get("actorUserId"),
                    created_at,
                ),
            )

        if movement_type == "ADJUSTMENT":
            db.execute(
                """
                INSERT INTO audit_logs
                  (user_id, actor_name, action, entity_type, entity_id, details_json, created_at)
                VALUES (?, ?, 'STOCK_ADJUSTMENT', 'PRODUCT_VARIANT', ?, ?, ?)
                """,
                (
                    data.get("actorUserId"),
                    data.get("actorName") or "Staff",
                    str(variant["id"]),
                    json.dumps({
                        "sku": variant["sku"],
                        "delta": data["quantityDelta"],
                        "nextQty": next_qty,
                        "reason": data["reason"],
                    }),
                    created_at,
                ),
            )

        return {
            "variantId": variant["id"],
            "sku": variant["sku"],
            "previousQty": variant["stockQty"],
            "newQty": next_qty,
        }


def list_stock_movements(
    limit: int = 100, db: Database | None = None
) -> list[dict[str, Any]]:
    db = db or get_db()
    return db.fetch_all(
        """
        SELECT sm.*, pv.sku AS sku, pv.size AS size, p.name AS productName
        FROM stock_movements sm
        INNER JOIN product_variants pv ON sm.variant_id = pv.id
        INNER JOIN products p ON pv.product_id = p.id
        ORDER BY sm.id DESC
        LIMIT ?
        """,
        (limit,),
    )


def create_product(
    data: dict[str, Any], db: Database | None = None
) -> dict[str, Any]:
    db = db or get_db()
    with db.immediate_tx():
        created_at = now_iso()
        prod = db.insert_returning(
            """
            INSERT INTO products
              (name, sku, category, brand, description, image_url, price_paise, cost_price_paise, reorder_level, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, '/src/assets/images/shop_pro_gear_1795254057097.jpg', ?, ?, ?, 1, ?)
            RETURNING *
            """,
            (
                data["name"],
                data["sku"],
                str(data["category"]).upper(),
                data["brand"],
                data["description"],
                data["pricePaise"],
                data["costPricePaise"],
                data.get("reorderLevel", 5),
                created_at,
            ),
        )

        for v in data["variants"]:
            ins_v = db.insert_returning(
                """
                INSERT INTO product_variants (product_id, sku, size, color, stock_qty)
                VALUES (?, ?, ?, ?, ?)
                RETURNING *
                """,
                (prod["id"], v["sku"], v["size"], v["color"], v["stockQty"]),
            )
            if v["stockQty"] > 0:
                db.execute(
                    """
                    INSERT INTO stock_movements
                      (variant_id, movement_type, quantity_delta, unit_cost_paise, reference_type, reason, created_at)
                    VALUES (?, 'RESTOCK', ?, ?, 'MANUAL', 'Initial product stock', ?)
                    """,
                    (ins_v["id"], v["stockQty"], data["costPricePaise"], now_iso()),
                )

        return prod
