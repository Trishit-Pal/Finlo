"""Structured exception hierarchy with user-friendly messages.

All API errors return: {"status": "error", "code": "...", "message": "...", "details": {...}}
matching the error shape defined in CLAUDE.md.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status


class FinloException(HTTPException):
    """Base app exception with structured error response."""

    def __init__(
        self,
        status_code: int,
        detail: str,
        user_message: Optional[str] = None,
        code: str = "UNKNOWN",
        details: Optional[dict[str, Any]] = None,
    ):
        self.user_message = user_message or detail
        self.error_code = code
        self.error_details = details or {}
        super().__init__(status_code=status_code, detail=detail)


# ── Auth Errors ─────────────────────────────────────────────────────────────


class InvalidCredentials(FinloException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            user_message="The email or password you entered is incorrect.",
            code="INVALID_CREDENTIALS",
        )


class TokenExpired(FinloException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            user_message="Your session has expired. Please sign in again.",
            code="TOKEN_EXPIRED",
        )


class TokenInvalid(FinloException):
    def __init__(self, detail: str = "Invalid token"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            user_message="Authentication failed. Please sign in again.",
            code="TOKEN_INVALID",
        )


class EmailAlreadyRegistered(FinloException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
            user_message="An account with this email already exists.",
            code="EMAIL_EXISTS",
        )


class WeakPassword(FinloException):
    def __init__(self, reason: str):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=reason,
            user_message=reason,
            code="WEAK_PASSWORD",
        )


# ── Resource Errors ─────────────────────────────────────────────────────────


class ResourceNotFound(FinloException):
    def __init__(self, resource: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource} not found",
            user_message=f"Sorry, we couldn't find that {resource.lower()}.",
            code="NOT_FOUND",
        )


class ResourceConflict(FinloException):
    def __init__(self, detail: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            user_message=detail,
            code="CONFLICT",
        )


# ── Validation Errors ───────────────────────────────────────────────────────


class ValidationError(FinloException):
    def __init__(self, detail: str, field: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            user_message=detail,
            code="VALIDATION_ERROR",
            details={"field": field} if field else {},
        )


# ── Upload Errors ───────────────────────────────────────────────────────────


class FileTooLarge(FinloException):
    def __init__(self, max_mb: int):
        super().__init__(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {max_mb} MB limit",
            user_message=f"File is too large. Maximum size is {max_mb} MB.",
            code="FILE_TOO_LARGE",
        )


class UnsupportedFileType(FinloException):
    def __init__(self, content_type: str):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type: {content_type}",
            user_message="Invalid file format. Please use JPG, PNG, WebP, or PDF.",
            code="UNSUPPORTED_FILE_TYPE",
        )


# ── Rate Limiting ───────────────────────────────────────────────────────────


class RateLimited(FinloException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            user_message="Too many requests. Please wait a moment and try again.",
            code="RATE_LIMITED",
        )


# ── External Service Errors ─────────────────────────────────────────────────


class ExternalServiceError(FinloException):
    def __init__(self, service: str):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{service} service unavailable",
            user_message="An external service is temporarily unavailable. Please try again.",
            code="SERVICE_UNAVAILABLE",
        )
