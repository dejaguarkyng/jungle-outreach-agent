from __future__ import annotations


class OptionalSourceError(RuntimeError):
    def __init__(self, source: str, message: str, *, status_code: int | None = None):
        self.source = source
        self.status_code = status_code
        super().__init__(message)
