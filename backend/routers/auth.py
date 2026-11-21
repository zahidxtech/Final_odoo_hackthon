from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, EmailStr, Field

from ..security import AuthUser, clear_auth_cookie, require_auth, set_auth_cookie
from ..services.auth_service import (
    get_current_user_profile,
    login_user,
    register_public_member,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class RegisterRequest(BaseModel):
    fullName: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=7)
    password: str = Field(min_length=6)
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    planCode: Literal["GOLD", "SILVER", "JUNIOR"]
    billingCycle: Literal["MONTHLY", "ANNUAL"] = "ANNUAL"
    emergencyContactName: str = Field(min_length=2)
    emergencyContactPhone: str = Field(min_length=7)
    paymentMethod: Literal["CARD", "UPI", "ONLINE"] = "CARD"


@router.post("/login")
def login(body: LoginRequest, response: Response):
    result = login_user(body.email, body.password)
    set_auth_cookie(response, result["token"])
    return result


@router.post("/register", status_code=201)
def register(body: RegisterRequest, response: Response):
    result = register_public_member(body.model_dump())
    set_auth_cookie(response, result["token"])
    return result


@router.post("/logout")
def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: AuthUser = Depends(require_auth)):
    profile = get_current_user_profile(user.id)
    return {"user": profile}
