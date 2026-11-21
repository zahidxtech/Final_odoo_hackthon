from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field

from ..db import get_db
from ..errors import AppError
from ..security import AuthUser, optional_auth, require_auth, require_roles
from ..services.booking_service import (
    calculate_court_quote,
    cancel_booking,
    create_booking,
    create_court_block,
    create_social_session,
    get_availability_grid,
    get_courts,
    join_social_session,
    leave_social_session,
    list_bookings,
    list_social_sessions,
    reschedule_booking,
    update_booking_attendance,
)
from ..time_utils import to_ist_date_string

router = APIRouter(prefix="/bookings", tags=["Courts & Bookings"])


class TrialBookingRequest(BaseModel):
    courtId: int = Field(gt=0)
    bookingDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    startTimeHHMM: str = Field(pattern=r"^\d{2}:\d{2}$")
    guestName: str = Field(min_length=2)
    guestPhone: str = Field(min_length=7)
    guestEmail: EmailStr | None = None
    paymentMethod: Literal["CARD", "UPI", "ONLINE"] = "CARD"


class CreateBookingRequest(BaseModel):
    courtId: int = Field(gt=0)
    bookingDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    startTimeHHMM: str = Field(pattern=r"^\d{2}:\d{2}$")
    memberId: int | None = Field(default=None, gt=0)
    guestName: str | None = Field(default=None, min_length=2)
    guestPhone: str | None = Field(default=None, min_length=7)
    guestEmail: EmailStr | None = None
    bookingType: Literal["MEMBER", "WALK_IN", "PHONE", "TRIAL"] | None = None
    paymentMethod: Literal["CASH", "CARD", "UPI", "ONLINE", "CREDIT", "FREE"] | None = None
    notes: str | None = None


class CancelBookingRequest(BaseModel):
    refundAsCredit: bool = False


class RescheduleBookingRequest(BaseModel):
    bookingDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    startTimeHHMM: str = Field(pattern=r"^\d{2}:\d{2}$")
    courtId: int | None = Field(default=None, gt=0)


class AttendanceRequest(BaseModel):
    status: Literal["CHECKED_IN", "COMPLETED", "NO_SHOW"]


class CreateSocialRequest(BaseModel):
    title: str = Field(min_length=3)
    courtId: int = Field(gt=0)
    sessionDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    startTimeHHMM: str = Field(pattern=r"^\d{2}:\d{2}$")
    durationMinutes: int = Field(default=90, ge=60, le=180)
    capacity: int = Field(ge=2, le=20)
    pricePerHeadPaise: int = Field(ge=0)


class JoinSocialRequest(BaseModel):
    memberId: int | None = Field(default=None, gt=0)
    guestName: str | None = Field(default=None, min_length=2)
    guestPhone: str | None = Field(default=None, min_length=7)
    paymentMethod: Literal["CASH", "CARD", "UPI", "ONLINE"] = "UPI"


class LeaveSocialRequest(BaseModel):
    memberId: int | None = None


class CourtBlockRequest(BaseModel):
    courtId: int | None = Field(default=None, gt=0)
    blockType: Literal["MAINTENANCE", "HOLIDAY", "TOURNAMENT"]
    reason: str = Field(min_length=3)
    startDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    startHHMM: str = Field(pattern=r"^\d{2}:\d{2}$")
    endDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    endHHMM: str = Field(pattern=r"^\d{2}:\d{2}$")


@router.get("/courts")
def courts(sport: str | None = Query(default=None)):
    return {"courts": get_courts(sport)}


@router.get("/availability")
def availability(
    date: str | None = Query(default=None),
    sport: str | None = Query(default=None),
    user: AuthUser | None = Depends(optional_auth),
):
    date_str = (
        date
        if (date and re.match(r"^\d{4}-\d{2}-\d{2}$", date))
        else to_ist_date_string()
    )
    return get_availability_grid(
        date_str, sport, user.memberId if user else None
    )


@router.get("/quote")
def quote(
    courtId: int = Query(...),
    startTime: str = Query(default="08:00"),
    memberId: int | None = Query(default=None),
    user: AuthUser | None = Depends(optional_auth),
):
    effective_member = (
        memberId if memberId is not None else (user.memberId if user else None)
    )
    court = get_db().fetch_one("SELECT * FROM courts WHERE id = ?", (courtId,))
    if not court:
        raise AppError(404, "COURT_NOT_FOUND", "Court not found.")
    return {"quote": calculate_court_quote(court, effective_member, startTime)}


@router.get("/social")
def list_social():
    return {"sessions": list_social_sessions()}


@router.post("/trial", status_code=201)
def trial_booking(body: TrialBookingRequest):
    booking = create_booking({
        **body.model_dump(),
        "memberId": None,
        "bookingType": "TRIAL",
        "notes": "Online trial session booking",
    })
    return {"booking": booking}


@router.get("")
def bookings_list(
    date: str | None = Query(default=None),
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
        "bookings": list_bookings({
            "date": date,
            "memberId": effective_member,
            "status": status,
        })
    }


@router.post("", status_code=201)
def booking_create(
    body: CreateBookingRequest, user: AuthUser = Depends(require_auth)
):
    effective_member = (
        user.memberId if user.role == "MEMBER" else body.memberId
    )
    if user.role == "MEMBER" and not effective_member:
        raise AppError(400, "NO_MEMBER_PROFILE", "Member profile missing.")
    booking = create_booking({
        **body.model_dump(),
        "memberId": effective_member,
        "actorUserId": user.id,
    })
    return {"booking": booking}


@router.post("/{booking_id}/cancel")
def booking_cancel(
    booking_id: int,
    body: CancelBookingRequest | None = None,
    user: AuthUser = Depends(require_auth),
):
    return cancel_booking(
        booking_id,
        {
            "actorUserId": user.id,
            "actorName": user.fullName,
            "actorRole": user.role,
            "actorMemberId": user.memberId,
            "refundAsCredit": body.refundAsCredit if body else False,
        },
    )


@router.post("/{booking_id}/reschedule")
def booking_reschedule(
    booking_id: int,
    body: RescheduleBookingRequest,
    user: AuthUser = Depends(require_auth),
):
    booking = reschedule_booking(
        booking_id,
        body.bookingDate,
        body.startTimeHHMM,
        body.courtId,
        {
            "actorUserId": user.id,
            "actorName": user.fullName,
            "actorRole": user.role,
            "actorMemberId": user.memberId,
        },
    )
    return {"booking": booking}


@router.patch("/{booking_id}/attendance")
def booking_attendance(
    booking_id: int,
    body: AttendanceRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {"booking": update_booking_attendance(booking_id, body.status)}


@router.post("/social", status_code=201)
def social_create(
    body: CreateSocialRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    session = create_social_session({**body.model_dump(), "actorUserId": user.id})
    return {"session": session}


@router.post("/social/{session_id}/join", status_code=201)
def social_join(
    session_id: int,
    body: JoinSocialRequest,
    user: AuthUser | None = Depends(optional_auth),
):
    effective_member = (
        user.memberId
        if (user and user.role == "MEMBER")
        else (body.memberId if body.memberId is not None else (user.memberId if user else None))
    )
    return join_social_session(
        session_id,
        {
            **body.model_dump(),
            "memberId": effective_member,
            "actorUserId": user.id if user else None,
        },
    )


@router.post("/social/{session_id}/leave")
def social_leave(
    session_id: int,
    body: LeaveSocialRequest | None = None,
    user: AuthUser = Depends(require_auth),
):
    member_id = (
        user.memberId
        if user.role == "MEMBER"
        else (body.memberId if body else None)
    )
    if not member_id:
        raise AppError(400, "MEMBER_REQUIRED", "Member ID required.")
    return leave_social_session(session_id, member_id)


@router.post("/blocks", status_code=201)
def court_block_create(
    body: CourtBlockRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {
        "block": create_court_block({**body.model_dump(), "actorUserId": user.id})
    }
