from __future__ import annotations

import logging
from typing import Protocol

from app.config import get_settings

logger = logging.getLogger(__name__)


class OTPProvider(Protocol):
    async def send_otp(self, mobile_number: str, otp_code: str) -> None:
        """Send OTP to recipient number."""


class MockOTPProvider:
    async def send_otp(self, mobile_number: str, otp_code: str) -> None:
        # Intentional mock transport for local/dev/test.
        logger.info(
            "otp_sent provider=mock mobile_number=%s otp_code=%s",
            mobile_number,
            otp_code,
        )


def get_otp_provider() -> OTPProvider:
    settings = get_settings()
    provider = settings.OTP_PROVIDER.lower()
    if provider == "mock":
        return MockOTPProvider()
    raise ValueError(f"Unsupported OTP provider: {settings.OTP_PROVIDER}")
