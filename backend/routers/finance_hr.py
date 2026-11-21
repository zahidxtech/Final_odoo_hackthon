from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field

from ..security import AuthUser, require_auth, require_roles
from ..services.finance_hr_service import (
    create_corporate_client,
    create_corporate_invoice,
    create_expense,
    create_leave_request,
    create_share_report_token,
    create_shift,
    get_hr_overview,
    get_owner_dashboard,
    get_shared_report_by_token,
    list_audit_logs,
    list_clients_and_invoices,
    list_expenses,
    list_notifications,
    list_settings,
    list_transactions,
    mark_expense_paid,
    mark_notification_read,
    record_invoice_payment,
    review_leave_request,
    run_monthly_payroll,
    update_setting,
)

router = APIRouter(tags=["Finance, HR & Notifications"])


class ShareReportRequest(BaseModel):
    period: Literal["TODAY", "WEEK", "MONTH", "CUSTOM"]
    startDate: str | None = None
    endDate: str | None = None


class CreateExpenseRequest(BaseModel):
    category: Literal[
        "RENT", "UTILITIES", "SALARIES", "INVENTORY_PURCHASE", "MAINTENANCE", "MARKETING"
    ]
    vendorName: str = Field(min_length=2)
    description: str = Field(min_length=3)
    amountPaise: int = Field(gt=0)
    taxPaise: int = Field(default=0, ge=0)
    expenseDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    dueDate: str | None = None
    status: Literal["PAID", "PAYABLE"] = "PAID"
    isRecurring: bool = False


class CreateClientRequest(BaseModel):
    companyName: str = Field(min_length=2)
    contactPerson: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=7)
    gstNumber: str | None = None
    billingAddress: str = Field(min_length=4)


class InvoiceItemInput(BaseModel):
    description: str = Field(min_length=2)
    quantity: int = Field(gt=0)
    unitPricePaise: int = Field(gt=0)
    taxRatePct: int = Field(default=18, ge=0, le=28)


class CreateInvoiceRequest(BaseModel):
    clientId: int = Field(gt=0)
    dueDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    notes: str | None = None
    items: list[InvoiceItemInput] = Field(min_length=1)


class PayInvoiceRequest(BaseModel):
    amountPaise: int = Field(gt=0)
    method: Literal["CASH", "CARD", "UPI", "BANK_TRANSFER"] = "BANK_TRANSFER"


class UpdateSettingRequest(BaseModel):
    value: str = Field(min_length=1)


class CreateShiftRequest(BaseModel):
    employeeId: int = Field(gt=0)
    shiftDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    shiftType: Literal["MORNING", "EVENING", "NIGHT"]
    startTime: str = Field(pattern=r"^\d{2}:\d{2}$")
    endTime: str = Field(pattern=r"^\d{2}:\d{2}$")
    station: str = Field(min_length=2)


class CreateLeaveRequest(BaseModel):
    employeeId: int = Field(gt=0)
    leaveType: Literal["CASUAL", "SICK", "EARNED"]
    startDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    endDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    daysCount: int = Field(gt=0)
    reason: str = Field(min_length=3)


class ReviewLeaveRequest(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]


class PayrollRunRequest(BaseModel):
    payMonth: str = Field(pattern=r"^\d{4}-\d{2}$")


# Finance routes
@router.get("/finance/share-report/{token}")
def share_report_get(token: str):
    return get_shared_report_by_token(token)


@router.get("/finance/dashboard")
def owner_dashboard(
    period: str = Query(default="MONTH"),
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return get_owner_dashboard(period, startDate, endDate)


@router.post("/finance/share-report", status_code=201)
def share_report_create(
    body: ShareReportRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return create_share_report_token(
        body.period, body.startDate, body.endDate, user.id
    )


@router.get("/finance/ledger")
def ledger(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"transactions": list_transactions(300)}


@router.get("/finance/expenses")
def expenses_list(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"expenses": list_expenses()}


@router.post("/finance/expenses", status_code=201)
def expenses_create(
    body: CreateExpenseRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"expense": create_expense({**body.model_dump(), "actorUserId": user.id})}


@router.post("/finance/expenses/{expense_id}/pay")
def expense_pay(
    expense_id: int,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"expense": mark_expense_paid(expense_id)}


@router.get("/finance/invoices")
def invoices_list(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return list_clients_and_invoices()


@router.post("/finance/clients", status_code=201)
def client_create(
    body: CreateClientRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"client": create_corporate_client(body.model_dump())}


@router.post("/finance/invoices", status_code=201)
def invoice_create(
    body: CreateInvoiceRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"invoice": create_corporate_invoice(body.model_dump())}


@router.post("/finance/invoices/{invoice_id}/pay")
def invoice_pay(
    invoice_id: int,
    body: PayInvoiceRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {
        "invoice": record_invoice_payment(
            invoice_id, body.amountPaise, body.method, user.id, user.fullName
        )
    }


@router.get("/finance/audit-logs")
def audit_logs(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"logs": list_audit_logs(150)}


@router.get("/finance/settings")
def settings_list(
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER", "FRONT_DESK")),
):
    return {"settings": list_settings()}


@router.patch("/finance/settings/{key}")
def setting_patch(
    key: str,
    body: UpdateSettingRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"setting": update_setting(key, body.value, user.id, user.fullName)}


# HR routes
@router.get("/hr/overview")
def hr_overview(
    _user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "FRONT_DESK", "BAR_STAFF", "SHOP_STAFF")
    ),
):
    return get_hr_overview()


@router.post("/hr/shifts", status_code=201)
def shift_create(
    body: CreateShiftRequest,
    _user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"shift": create_shift(body.model_dump())}


@router.post("/hr/leaves", status_code=201)
def leave_create(
    body: CreateLeaveRequest,
    _user: AuthUser = Depends(
        require_roles("OWNER", "MANAGER", "FRONT_DESK", "BAR_STAFF", "SHOP_STAFF")
    ),
):
    return {"leaveRequest": create_leave_request(body.model_dump())}


@router.patch("/hr/leaves/{leave_id}/review")
def leave_review(
    leave_id: int,
    body: ReviewLeaveRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"leaveRequest": review_leave_request(leave_id, body.decision, user.id)}


@router.post("/hr/payroll/run", status_code=201)
def payroll_run(
    body: PayrollRunRequest,
    user: AuthUser = Depends(require_roles("OWNER", "MANAGER")),
):
    return {"payrollRun": run_monthly_payroll(body.payMonth, user.id, user.fullName)}


# Notifications
@router.get("/notifications")
def notifications_list(user: AuthUser = Depends(require_auth)):
    return {"notifications": list_notifications(user.role, user.memberId)}


@router.post("/notifications/{notif_id}/read")
def notification_read(notif_id: int, _user: AuthUser = Depends(require_auth)):
    return mark_notification_read(notif_id)
