from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field

from ..security import AuthUser, optional_auth, require_auth, require_roles
from ..services.shop_service import (
    create_product,
    create_shop_order,
    get_low_stock_variants,
    list_products,
    list_shop_orders,
    list_stock_movements,
    list_suppliers,
    restock_or_adjust_variant,
    update_shop_order_status,
)
from ..services.telegram_service import notify_shop_order_created

router = APIRouter(prefix="/shop", tags=["Shop & Inventory"])


class ProductVariantInput(BaseModel):
    sku: str = Field(min_length=2)
    size: str = Field(min_length=1)
    color: str = Field(min_length=1)
    stockQty: int = Field(ge=0)


class CreateProductRequest(BaseModel):
    name: str = Field(min_length=2)
    sku: str = Field(min_length=2)
    category: Literal["RACKETS", "BALLS", "SHOES", "ACCESSORIES", "APPAREL"]
    brand: str = Field(min_length=2)
    description: str = Field(min_length=4)
    pricePaise: int = Field(gt=0)
    costPricePaise: int = Field(gt=0)
    reorderLevel: int = Field(default=5, ge=1)
    variants: list[ProductVariantInput] = Field(min_length=1)


class RestockRequest(BaseModel):
    variantId: int = Field(gt=0)
    quantityDelta: int
    movementType: Literal["RESTOCK", "ADJUSTMENT"]
    supplierId: int | None = Field(default=None, gt=0)
    unitCostPaise: int | None = Field(default=None, gt=0)
    reason: str = Field(min_length=3)


class OrderItemInput(BaseModel):
    variantId: int = Field(gt=0)
    quantity: int = Field(gt=0)


class DeliveryAddressInput(BaseModel):
    addressLine: str = Field(min_length=4)
    city: str = Field(min_length=2)
    postalCode: str = Field(min_length=4)
    deliveryNotes: str | None = None


class CreateShopOrderRequest(BaseModel):
    memberId: int | None = Field(default=None, gt=0)
    customerName: str = Field(min_length=2)
    customerPhone: str = Field(min_length=7)
    customerEmail: EmailStr | None = None
    channel: Literal["ONLINE", "POS"] = "ONLINE"
    fulfilmentType: Literal["PICKUP", "DELIVERY", "COUNTER"] = "PICKUP"
    paymentMethod: Literal["CASH", "CARD", "UPI", "ONLINE"] = "CARD"
    items: list[OrderItemInput] = Field(min_length=1)
    deliveryAddress: DeliveryAddressInput | None = None


class OrderStatusRequest(BaseModel):
    status: Literal[
        "PLACED", "CONFIRMED", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"
    ]


@router.get("/products")
def products(
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    lowStockOnly: str | None = Query(default=None),
):
    return {
        "products": list_products({
            "category": category,
            "search": search,
            "lowStockOnly": lowStockOnly == "true",
        })
    }


@router.post("/products", status_code=201)
def add_product(
    body: CreateProductRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "SHOP_STAFF")),
):
    return {"product": create_product(body.model_dump())}


@router.get("/low-stock")
def low_stock(
    _user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "SHOP_STAFF", "FRONT_DESK")
    ),
):
    return {"items": get_low_stock_variants()}


@router.get("/suppliers")
def suppliers(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "SHOP_STAFF")),
):
    return {"suppliers": list_suppliers()}


@router.get("/movements")
def movements(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "SHOP_STAFF")),
):
    return {"movements": list_stock_movements(120)}


@router.post("/restock")
def restock(
    body: RestockRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "SHOP_STAFF")),
):
    if body.quantityDelta == 0:
        from ..errors import AppError

        raise AppError(400, "VALIDATION_ERROR", "quantityDelta cannot be 0.")
    return restock_or_adjust_variant({
        **body.model_dump(),
        "actorUserId": user.id,
        "actorName": user.fullName,
    })


@router.get("/orders")
def orders_list(
    status: str | None = Query(default=None),
    memberId: int | None = Query(default=None),
    user: AuthUser = Depends(require_auth),
):
    effective_member = (
        (user.memberId if user.memberId is not None else -1)
        if user.role == "MEMBER"
        else memberId
    )
    return {
        "orders": list_shop_orders(
            {"memberId": effective_member, "status": status}
        )
    }


@router.post("/orders", status_code=201)
def orders_create(
    body: CreateShopOrderRequest,
    user: AuthUser | None = Depends(optional_auth),
):
    effective_member = (
        user.memberId
        if (user and user.role == "MEMBER")
        else body.memberId
    )
    order = create_shop_order({
        **body.model_dump(),
        "memberId": effective_member,
        "actorUserId": user.id if user else None,
    })
    notify_shop_order_created(order)
    return {"order": order}


@router.patch("/orders/{order_id}/status")
def order_status_patch(
    order_id: int,
    body: OrderStatusRequest,
    user: AuthUser = Depends(require_auth),
):
    updated = update_shop_order_status(
        order_id,
        body.status,
        user.id,
        user.fullName,
        user.role,
        user.memberId,
    )
    return {"order": updated}
