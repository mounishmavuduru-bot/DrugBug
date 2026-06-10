"""Object storage for scan images and generated briefs (PRD §12, §15).

Stores artifacts in S3/R2-compatible object storage with signed, expiring URLs
when configured; otherwise falls back to a local artifact directory (dev). Real
S3 access uses boto3 lazily (optional dep) — absent or unconfigured → local
fallback, and the returned `ref` is a local path key.

Returns an object-storage KEY (not a URL) for writeback; the client/service
generates signed URLs separately. This keeps buckets private (no public access).
"""

from __future__ import annotations

import os
import uuid
from typing import Any

from app.config import get_settings


class ArtifactStorage:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def s3_configured(self) -> bool:
        s = self.settings
        return bool(
            s.object_storage_endpoint
            and s.object_storage_bucket
            and s.object_storage_access_key
            and s.object_storage_secret_key
        )

    def status(self) -> dict[str, Any]:
        if self.s3_configured:
            try:
                import boto3  # noqa: F401

                return {"available": True, "backend": "s3", "reason": None}
            except Exception as exc:
                return {"available": True, "backend": "local", "reason": f"boto3 missing: {exc}"}
        return {"available": True, "backend": "local", "reason": "object storage not configured — using local dir"}

    def _client(self):
        import boto3

        s = self.settings
        return boto3.client(
            "s3",
            endpoint_url=s.object_storage_endpoint,
            aws_access_key_id=s.object_storage_access_key,
            aws_secret_access_key=s.object_storage_secret_key,
        )

    def put_bytes(self, key_prefix: str, data: bytes, content_type: str, ext: str) -> str:
        key = f"{key_prefix}/{uuid.uuid4().hex}.{ext}"
        if self.s3_configured:
            try:
                client = self._client()
                client.put_object(
                    Bucket=self.settings.object_storage_bucket,
                    Key=key,
                    Body=data,
                    ContentType=content_type,
                )
                return key
            except Exception:
                pass  # fall through to local on any S3 error
        # Local fallback
        base = self.settings.local_artifact_dir
        path = os.path.join(base, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return key

    def put_text(self, key_prefix: str, text: str, ext: str = "md") -> str:
        return self.put_bytes(key_prefix, text.encode("utf-8"), "text/markdown", ext)


_instance: ArtifactStorage | None = None


def get_storage() -> ArtifactStorage:
    global _instance
    if _instance is None:
        _instance = ArtifactStorage()
    return _instance
