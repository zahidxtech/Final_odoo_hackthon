from __future__ import annotations

from unittest.mock import Mock

from backend.services import telegram_service


def test_telegram_alert_is_disabled_without_both_settings(monkeypatch):
    monkeypatch.setattr(telegram_service, "get_telegram_bot_token", lambda: "token")
    monkeypatch.setattr(telegram_service, "get_telegram_chat_id", lambda: "")
    send = Mock()
    monkeypatch.setattr(telegram_service.httpx, "post", send)

    telegram_service.notify_shop_order_created(
        {"orderNumber": "ORD-1", "customerName": "Member"}
    )

    send.assert_not_called()


def test_shop_alert_excludes_contact_and_delivery_address(monkeypatch):
    monkeypatch.setattr(telegram_service, "get_telegram_bot_token", lambda: "token")
    monkeypatch.setattr(telegram_service, "get_telegram_chat_id", lambda: "123")
    response = Mock()
    response.json.return_value = {"ok": True}
    monkeypatch.setattr(telegram_service.httpx, "post", Mock(return_value=response))

    telegram_service.notify_shop_order_created(
        {
            "orderNumber": "ORD-1",
            "customerName": "Alex Customer",
            "customerPhone": "+91 99999 11111",
            "customerEmail": "alex@example.com",
            "channel": "ONLINE",
            "fulfilmentType": "DELIVERY",
            "totalPaise": 12500,
            "status": "PLACED",
            "items": [{"productName": "Racket", "quantity": 1}],
            "delivery": {"addressLine": "Private address"},
        }
    )

    message = telegram_service.httpx.post.call_args.kwargs["json"]["text"]
    assert "Alex Customer" in message
    assert "Racket x1" in message
    assert "INR 125.00" in message
    assert "+91 99999 11111" not in message
    assert "alex@example.com" not in message
    assert "Private address" not in message


def test_telegram_delivery_failure_does_not_fail_order_flow(monkeypatch, caplog):
    monkeypatch.setattr(telegram_service, "get_telegram_bot_token", lambda: "token")
    monkeypatch.setattr(telegram_service, "get_telegram_chat_id", lambda: "123")
    monkeypatch.setattr(
        telegram_service.httpx,
        "post",
        Mock(side_effect=telegram_service.httpx.TimeoutException("timed out")),
    )

    telegram_service.notify_bar_order_created({"orderNumber": "BAR-1"})

    assert "Telegram activity alert delivery failed" in caplog.text
