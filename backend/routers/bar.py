from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..errors import AppError
from ..security import AuthUser, require_roles
from ..services.bar_service import (
    create_bar_order,
    get_daily_bar_closing_report,
    list_bar_tables,
    list_kds_orders,
    list_menu_items,
    list_tabs,
    settle_tab,
    settle_table_orders,
    toggle_menu_item_availability,
    transfer_or_merge_table,
    update_kds_status,
    update_table_status,
)
from ..time_utils import to_ist_date_string

router = APIRouter(prefix="/bar", tags=["Bar & Cafeteria"])


class MenuAvailabilityRequest(BaseModel):
    isAvailable: bool


class TableStatusRequest(BaseModel):
    status: Literal["FREE", "OCCUPIED", "AWAITING_BILL"]
    memberId: int | None = Field(default=None, gt=0)


class TableTransferRequest(BaseModel):
    fromTableId: int = Field(gt=0)
    toTableId: int = Field(gt=0)


class PaymentPartInput(BaseModel):
    method: Literal["CASH", "CARD", "UPI"]
    amountPaise: int = Field(gt=0)


class SettlePaymentsRequest(BaseModel):
    payments: list[PaymentPartInput] = Field(min_length=1)


class BarOrderItemInput(BaseModel):
    menuItemId: int = Field(gt=0)
    quantity: int = Field(gt=0)
    notes: str | None = None


class CreateBarOrderRequest(BaseModel):
    tableId: int | None = Field(default=None, gt=0)
    memberId: int | None = Field(default=None, gt=0)
    chargeToTab: bool | None = None
    paymentMethod: Literal["CASH", "CARD", "UPI"] | None = None
    splitPayments: list[PaymentPartInput] | None = None
    items: list[BarOrderItemInput] = Field(min_length=1)
    notes: str | None = None


class CreateMemberBarOrderRequest(BaseModel):
    chargeToTab: bool = False
    paymentMethod: Literal["CARD", "UPI"] = "CARD"
    items: list[BarOrderItemInput] = Field(min_length=1)
    notes: str | None = None


class KdsStatusRequest(BaseModel):
    kdsStatus: Literal["NEW", "PREPARING", "READY", "SERVED", "CANCELLED"]


@router.get("/menu")
def menu(availableOnly: str | None = Query(default=None)):
    include_unavailable = availableOnly != "true"
    return {"items": list_menu_items(include_unavailable)}


@router.patch("/menu/{item_id}/availability")
def menu_availability(
    item_id: int,
    body: MenuAvailabilityRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "BAR_STAFF")),
):
    return {"item": toggle_menu_item_availability(item_id, body.isAvailable)}


@router.get("/tables")
def tables(
    _user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "BAR_STAFF", "FRONT_DESK")
    ),
):
    return {"tables": list_bar_tables()}


@router.patch("/tables/{table_id}")
def patch_table(
    table_id: int,
    body: TableStatusRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "BAR_STAFF")),
):
    return {"table": update_table_status(table_id, body.model_dump())}


@router.post("/tables/transfer")
def transfer_table(
    body: TableTransferRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "BAR_STAFF")),
):
    return transfer_or_merge_table(body.fromTableId, body.toTableId)


@router.post("/tables/{table_id}/settle")
def settle_table(
    table_id: int,
    body: SettlePaymentsRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "BAR_STAFF")),
):
    return settle_table_orders(
        table_id, [p.model_dump() for p in body.payments], user.id
    )


@router.get("/orders/kds")
def kds_orders(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "BAR_STAFF")),
):
    return {"orders": list_kds_orders()}


@router.post("/orders", status_code=201)
def create_order(
    body: CreateBarOrderRequest,
    user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "BAR_STAFF", "FRONT_DESK")
    ),
):
    order = create_bar_order({**body.model_dump(), "staffUserId": user.id})
    return {"order": order}


@router.post("/member-orders", status_code=201)
def create_member_order(
    body: CreateMemberBarOrderRequest,
    user: AuthUser = Depends(require_roles("MEMBER")),
):
    if user.memberId is None:
        raise AppError(403, "MEMBER_PROFILE_REQUIRED", "A member profile is required to order.")
    order = create_bar_order(
        {
            **body.model_dump(),
            "memberId": user.memberId,
            "tableId": None,
            "staffUserId": None,
        }
    )
    return {"order": order}


@router.patch("/orders/{order_id}/kds")
def patch_kds(
    order_id: int,
    body: KdsStatusRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "BAR_STAFF")),
):
    return {"order": update_kds_status(order_id, body.kdsStatus)}


@router.get("/tabs")
def tabs(
    status: str | None = Query(default=None),
    _user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "BAR_STAFF", "FRONT_DESK")
    ),
):
    return {"tabs": list_tabs(status)}


@router.post("/tabs/{tab_id}/settle")
def settle_member_tab(
    tab_id: int,
    body: SettlePaymentsRequest,
    user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "BAR_STAFF", "FRONT_DESK")
    ),
):
    return settle_tab(
        tab_id, [p.model_dump() for p in body.payments], user.id
    )


@router.get("/closing-report")
def closing_report(
    date: str | None = Query(default=None),
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "BAR_STAFF")),
):
    target_date = date or to_ist_date_string()
    return {"report": get_daily_bar_closing_report(target_date)}
