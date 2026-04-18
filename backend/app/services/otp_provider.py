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
        # Intentional mock transport for local/dev/test — never use in production.
        logger.info("otp_sent provider=mock mobile_number=%s", mobile_number)


class TwilioOTPProvider:
    def __init__(self, account_sid: str, auth_token: str, from_number: str) -> None:
        from twilio.rest import Client  # type: ignore[import-untyped]
        self._client = Client(account_sid, auth_token)
        self._from = from_number

    async def send_otp(self, mobile_number: str, otp_code: str) -> None:
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.messages.create(
                body=f"Your Finlo verification code is {otp_code}. Valid for 10 minutes.",
                from_=self._from,
                to=mobile_number,
            ),
        )
        logger.info("otp_sent provider=twilio mobile_number=%s", mobile_number)


def get_otp_provider() -> OTPProvider:
    settings = get_settings()
    provider = settings.OTP_PROVIDER.lower()
    if provider == "mock":
        return MockOTPProvider()
    if provider == "twilio":
        twilio_sid = getattr(settings, "TWILIO_ACCOUNT_SID", None)
        twilio_token = getattr(settings, "TWILIO_AUTH_TOKEN", None)
        twilio_from = getattr(settings, "TWILIO_FROM_NUMBER", None)
        if not (twilio_sid and twilio_token and twilio_from):
            raise ValueError(
                "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER "
                "must all be set when OTP_PROVIDER=twilio"
            )
        return TwilioOTPProvider(twilio_sid, twilio_token, twilio_from)
    raise ValueError(f"Unsupported OTP provider: {settings.OTP_PROVIDER}")
