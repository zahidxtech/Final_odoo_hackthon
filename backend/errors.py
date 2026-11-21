from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    payload: dict[str, Any] = {
        "error": {
            "code": exc.code,
            "message": exc.message,
        }
    }
    if exc.details is not None:
        payload["error"]["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=payload)


async def validation_error_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request payload",
                "details": exc.errors(),
            }
        },
    )


async def unhandled_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected server error occurred.",
            }
        },
    )
