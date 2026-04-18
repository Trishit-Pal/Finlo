"""Encryption utilities: Fernet for PII, HMAC blind indexes for lookups."""
from __future__ import annotations

import hashlib
import hmac

from cryptography.fernet import Fernet

from app.config import get_settings

settings = get_settings()

fernet = Fernet(settings.PII_ENCRYPTION_KEY.encode())


def encrypt_value(value: str) -> str:
    """Encrypts a plaintext string and returns 'enc:' prefixed ciphertext."""
    if not value:
        return value
    return "enc:" + fernet.encrypt(value.encode()).decode()


def decrypt_value(value: str) -> str:
    """Decrypts a previously encrypted string starting with 'enc:'."""
    if not value or not value.startswith("enc:"):
        return value

    raw_cipher = value[4:]
    try:
        return fernet.decrypt(raw_cipher.encode()).decode()
    except Exception:
        return value


def compute_blind_index(value: str) -> str:
    """Deterministic HMAC-SHA256 blind index for encrypted field lookups.

    Allows looking up a row by plaintext value without decrypting all rows.
    Uses PII_ENCRYPTION_KEY as the HMAC key for domain separation.
    """
    if not value:
        return ""
    key = settings.PII_ENCRYPTION_KEY.encode()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()
