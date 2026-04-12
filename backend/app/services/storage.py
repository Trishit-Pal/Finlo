"""Encrypted object storage adapter (MinIO/S3)."""
from __future__ import annotations

import logging
import os
from io import BytesIO

logger = logging.getLogger(__name__)


class StorageService:
    def __init__(self) -> None:
        from app.config import get_settings
        self._settings = get_settings()
        self._client = None

    def _get_client(self):
        if self._client is None:
            import boto3
            self._client = boto3.client(
                "s3",
                endpoint_url=self._settings.STORAGE_ENDPOINT,
                aws_access_key_id=self._settings.STORAGE_ACCESS_KEY,
                aws_secret_access_key=self._settings.STORAGE_SECRET_KEY,
                region_name=self._settings.STORAGE_REGION,
            )
        return self._client

    def _encrypt(self, data: bytes) -> bytes:
        """AES-256-GCM encryption for raw image bytes."""
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            key_hex = self._settings.STORAGE_ENCRYPTION_KEY
            key = bytes.fromhex(key_hex[:64])  # 32 bytes
            nonce = os.urandom(12)
            aesgcm = AESGCM(key)
            ciphertext = aesgcm.encrypt(nonce, data, None)
            return nonce + ciphertext  # prepend nonce for decryption
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise

    def _decrypt(self, data: bytes) -> bytes:
        """Decrypt AES-256-GCM encrypted bytes."""
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        key_hex = self._settings.STORAGE_ENCRYPTION_KEY
        key = bytes.fromhex(key_hex[:64])
        nonce = data[:12]
        ciphertext = data[12:]
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, None)

    async def upload_encrypted(self, data: bytes, key: str, content_type: str) -> str:
        """Encrypt and upload to object storage. Returns public/internal URL."""
        import asyncio
        encrypted = self._encrypt(data)
        bucket = self._settings.STORAGE_BUCKET
        s3_key = f"encrypted/{key}"

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: self._get_client().put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=BytesIO(encrypted),
                ContentType="application/octet-stream",  # hide content type for privacy
            ),
        )
        endpoint = self._settings.STORAGE_ENDPOINT.rstrip("/")
        return f"{endpoint}/{bucket}/{s3_key}"

    async def download_decrypted(self, key: str) -> bytes:
        """Download and decrypt an object."""
        import asyncio
        bucket = self._settings.STORAGE_BUCKET

        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._get_client().get_object(Bucket=bucket, Key=key),
        )
        encrypted = response["Body"].read()
        return self._decrypt(encrypted)

    async def delete(self, key: str) -> None:
        """Delete an object (for GDPR compliance)."""
        import asyncio
        bucket = self._settings.STORAGE_BUCKET
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: self._get_client().delete_object(Bucket=bucket, Key=key),
        )
