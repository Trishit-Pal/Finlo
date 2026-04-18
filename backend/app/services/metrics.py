"""Lightweight request metrics collector — no external dependencies."""

import threading
import time
from collections import defaultdict


class _Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._request_count: int = 0
        self._error_count: int = 0
        self._path_counts: dict[str, int] = defaultdict(int)
        self._total_duration: float = 0.0
        self._start_time: float = time.time()

    def record(self, path: str, status: int, duration: float) -> None:
        with self._lock:
            self._request_count += 1
            self._path_counts[path] += 1
            self._total_duration += duration
            if status >= 500:
                self._error_count += 1

    def snapshot(self) -> dict:
        with self._lock:
            uptime = time.time() - self._start_time
            avg_ms = (
                round((self._total_duration / self._request_count) * 1000, 2)
                if self._request_count
                else 0.0
            )
            top_paths = sorted(
                self._path_counts.items(), key=lambda x: x[1], reverse=True
            )[:10]
            return {
                "uptime_seconds": round(uptime, 0),
                "total_requests": self._request_count,
                "total_errors_5xx": self._error_count,
                "avg_response_ms": avg_ms,
                "top_paths": [{"path": p, "count": c} for p, c in top_paths],
            }


metrics = _Metrics()
