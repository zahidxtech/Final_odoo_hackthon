from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field

from ..errors import AppError
from ..security import AuthUser, require_auth, require_roles
from ..services.membership_service import (
    get_member_history,
    list_plans,
    lookup_member_by_qr_token,
    register_member,
    renew_or_change_plan,
    search_members,
    sync_membership_statuses,
    update_member_status,
)

router = APIRouter(prefix="/members", tags=["Memberships"])


class RenewRequest(BaseModel):
    planCode: Literal["GOLD", "SILVER", "JUNIOR"]
    billingCycle: Literal["MONTHLY", "ANNUAL"]
    paymentMethod: Literal["CASH", "CARD", "UPI", "ONLINE"] = "CARD"


class RegisterMemberRequest(BaseModel):
    fullName: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=7)
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    photoUrl: str | None = None
    emergencyContactName: str = Field(min_length=2)
    emergencyContactPhone: str = Field(min_length=7)
    address: str | None = None
    planCode: Literal["GOLD", "SILVER", "JUNIOR"]
    billingCycle: Literal["MONTHLY", "ANNUAL"] = "ANNUAL"
    paymentMethod: Literal["CASH", "CARD", "UPI", "ONLINE"] = "CARD"
    createLoginPassword: str | None = Field(default=None, min_length=6)


class StatusUpdateRequest(BaseModel):
    status: Literal["ACTIVE", "FROZEN", "CANCELLED"]


@router.get("/plans")
def plans():
    return {"plans": list_plans()}


@router.get("/me/history")
def my_history(user: AuthUser = Depends(require_auth)):
    if not user.memberId:
        raise AppError(
            404, "NO_MEMBER_PROFILE", "No member profile linked to this account."
        )
    return get_member_history(user.memberId)


@router.post("/me/renew")
def my_renew(body: RenewRequest, user: AuthUser = Depends(require_auth)):
    if not user.memberId:
        raise AppError(
            404, "NO_MEMBER_PROFILE", "No member profile linked to this account."
        )
    updated = renew_or_change_plan(
        user.memberId,
        {
            **body.model_dump(),
            "actorUserId": user.id,
            "actorName": user.fullName,
        },
    )
    return {"member": updated}


@router.get("")
def list_members(
    q: str = Query(default=""),
    status: str | None = Query(default=None),
    _user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "FRONT_DESK", "BAR_STAFF", "SHOP_STAFF")
    ),
):
    return {"members": search_members(q, status)}


@router.get("/qr-lookup")
def qr_lookup(
    token: str = Query(default=""),
    _user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "FRONT_DESK", "BAR_STAFF", "SHOP_STAFF")
    ),
):
    member = lookup_member_by_qr_token(token)
    return {"member": member}


@router.get("/{member_id}/history")
def member_history(
    member_id: int,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return get_member_history(member_id)


@router.post("", status_code=201)
def create_member(
    body: RegisterMemberRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    result = register_member({**body.model_dump(), "staffUserId": user.id})
    return result


@router.post("/{member_id}/renew")
def renew_member(
    member_id: int,
    body: RenewRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    updated = renew_or_change_plan(
        member_id,
        {
            **body.model_dump(),
            "actorUserId": user.id,
            "actorName": user.fullName,
        },
    )
    return {"member": updated}


@router.patch("/{member_id}/status")
def patch_member_status(
    member_id: int,
    body: StatusUpdateRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    member = update_member_status(
        member_id, body.status, user.id, user.fullName
    )
    return {"member": member}


@router.post("/sync-statuses")
def sync_statuses(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return sync_membership_statuses()
