from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field

from ..security import AuthUser, require_roles
from ..services.crm_service import (
    add_lead_note,
    convert_lead_to_member,
    create_lead,
    create_quote_for_lead,
    list_leads,
    update_lead,
)

router = APIRouter(prefix="/crm", tags=["CRM & Leads"])


class PublicLeadRequest(BaseModel):
    fullName: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=7)
    interest: str = Field(min_length=2)
    message: str = Field(min_length=4)


class StaffLeadRequest(BaseModel):
    fullName: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=7)
    source: Literal["WEBSITE", "PHONE", "WALK_IN", "REFERRAL"] = "WALK_IN"
    interest: str = Field(min_length=2)
    message: str = Field(min_length=2)


class UpdateLeadRequest(BaseModel):
    status: Literal["NEW", "CONTACTED", "QUOTE_SENT", "WON", "LOST"] | None = None
    followUpDate: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    assignedUserId: int | None = Field(default=None, gt=0)


class AddNoteRequest(BaseModel):
    note: str = Field(min_length=2)


class CreateQuoteRequest(BaseModel):
    planCode: Literal["GOLD", "SILVER", "JUNIOR"]
    billingCycle: Literal["MONTHLY", "ANNUAL"] = "ANNUAL"
    discountPaise: int = Field(default=0, ge=0)
    notes: str | None = None


class ConvertLeadRequest(BaseModel):
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    planCode: Literal["GOLD", "SILVER", "JUNIOR"]
    billingCycle: Literal["MONTHLY", "ANNUAL"] = "ANNUAL"
    paymentMethod: Literal["CASH", "CARD", "UPI", "ONLINE"] = "CARD"
    emergencyContactName: str = Field(min_length=2)
    emergencyContactPhone: str = Field(min_length=7)


@router.post("/leads/public", status_code=201)
def create_public_lead(body: PublicLeadRequest):
    lead = create_lead({**body.model_dump(), "source": "WEBSITE"})
    return {"lead": lead}


@router.get("/leads")
def leads_list(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {"leads": list_leads()}


@router.post("/leads", status_code=201)
def leads_create(
    body: StaffLeadRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {"lead": create_lead({**body.model_dump(), "assignedUserId": user.id})}


@router.patch("/leads/{lead_id}")
def leads_update(
    lead_id: int,
    body: UpdateLeadRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    payload = body.model_dump(exclude_unset=True)
    return {"lead": update_lead(lead_id, payload)}


@router.post("/leads/{lead_id}/notes", status_code=201)
def leads_add_note(
    lead_id: int,
    body: AddNoteRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {"note": add_lead_note(lead_id, body.note, user.id)}


@router.post("/leads/{lead_id}/quotes", status_code=201)
def leads_create_quote(
    lead_id: int,
    body: CreateQuoteRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {
        "quote": create_quote_for_lead(
            lead_id, {**body.model_dump(), "actorUserId": user.id}
        )
    }


@router.post("/leads/{lead_id}/convert", status_code=201)
def leads_convert(
    lead_id: int,
    body: ConvertLeadRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return convert_lead_to_member(
        lead_id, {**body.model_dump(), "actorUserId": user.id}
    )
