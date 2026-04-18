import json
import logging
import sys
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings

settings = get_settings()


class JSONFormatter(logging.Formatter):
    """Formats log records as JSON."""

    def format(self, record: logging.LogRecord) -> str:
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if hasattr(record, "request_id"):
            log_record["request_id"] = record.request_id
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record)


def setup_logging():
    """Sets up root logger with JSON formatting."""
    handler = logging.StreamHandler(sys.stdout)
    if settings.ENVIRONMENT == "production":
        handler.setFormatter(JSONFormatter())
    else:
        # Standard format for development
        handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(
        logging.INFO if settings.ENVIRONMENT == "production" else logging.DEBUG
    )


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all requests in JSON format."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Use client-provided request ID or generate one for tracing
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        # Store on request state so downstream code can access it
        request.state.request_id = request_id
        start_time = time.time()

        response = await call_next(request)

        process_time = time.time() - start_time

        # Echo request ID and timing back to client for correlation
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{round(process_time * 1000)}ms"

        from app.services.metrics import metrics
        metrics.record(request.url.path, response.status_code, process_time)

        log_data = {
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration": round(process_time, 4),
            "request_id": request_id,
        }

        access_logger = logging.getLogger("app.access")
        if settings.ENVIRONMENT == "production":
            access_logger.info(json.dumps(log_data), extra={"request_id": request_id})
        else:
            access_logger.info(
                "[%s] %s %s - %s (%.4fs)",
                request_id[:8],
                request.method,
                request.url.path,
                response.status_code,
                process_time,
            )

        return response
