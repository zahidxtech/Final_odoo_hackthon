from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import get_telegram_bot_token, get_telegram_chat_id

logger = logging.getLogger(__name__)


def _safe_field(value: Any, limit: int = 120) -> str:
    text = str(value or "")
    return "".join(char if char >= " " and char != "\x7f" else " " for char in text)[
        :limit
    ].strip()


def _inr(amount_paise: Any) -> str:
    return f"INR {int(amount_paise or 0) / 100:,.2f}"


def _send_alert(message: str) -> None:
    token = get_telegram_bot_token()
    chat_id = get_telegram_chat_id()
    if not token or not chat_id:
        return

    try:
        response = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message[:4000]},
            timeout=5.0,
        )
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict) or result.get("ok") is not True:
            logger.warning("Telegram rejected a club activity alert")
    except (httpx.HTTPError, ValueError):
        logger.warning("Telegram activity alert delivery failed")


def notify_booking_created(booking: dict[str, Any]) -> None:
    quote = booking.get("quote") or {}
    start = _safe_field(booking.get("startTime"))
    slot_time = start.split("T", 1)[-1][:5] if "T" in start else start[:5]
    name = quote.get("memberName") or booking.get("guestName") or "Member"
    message = "\n".join(
        (
            "New court booking",
            f"Booking: #{_safe_field(booking.get('id'))}",
            f"Name: {_safe_field(name)}",
            f"Court: {_safe_field(booking.get('courtName'))}",
            f"Sport: {_safe_field(booking.get('sport'))}",
            f"When: {_safe_field(booking.get('bookingDate'))} {slot_time}",
            f"Total: {_inr(quote.get('finalAmountPaise'))}",
        )
    )
    _send_alert(message)


def notify_bar_order_created(order: dict[str, Any]) -> None:
    items = order.get("items") or []
    item_lines = [
        f"- {_safe_field(item.get('itemName'))} x{_safe_field(item.get('quantity'))}"
        for item in items[:30]
    ]
    name = order.get("memberName")
    message = "\n".join(
        [
            "New cafe order",
            f"Order: {_safe_field(order.get('orderNumber'))}",
            f"Name: {_safe_field(name) if name else 'Guest / walk-in'}",
            f"Table: {_safe_field(order.get('tableNumber') or 'Member order')}",
            *item_lines,
            f"Total: {_inr(order.get('totalPaise'))}",
            f"Billing: {_safe_field(order.get('billingStatus'))}",
        ]
    )
    _send_alert(message)


def notify_shop_order_created(order: dict[str, Any]) -> None:
    items = order.get("items") or []
    item_lines = [
        f"- {_safe_field(item.get('productName'))} x{_safe_field(item.get('quantity'))}"
        for item in items[:30]
    ]
    message = "\n".join(
        [
            "New shop order",
            f"Order: {_safe_field(order.get('orderNumber'))}",
            f"Name: {_safe_field(order.get('customerName'))}",
            f"Channel: {_safe_field(order.get('channel'))}",
            f"Fulfilment: {_safe_field(order.get('fulfilmentType'))}",
            *item_lines,
            f"Total: {_inr(order.get('totalPaise'))}",
            f"Status: {_safe_field(order.get('status'))}",
        ]
    )
    _send_alert(message)
