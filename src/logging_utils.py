from __future__ import annotations

import logging

from .settings import PIPELINE_LOG_PATH
from .storage import ensure_runtime_files


def get_logger() -> logging.Logger:
    ensure_runtime_files()
    logger = logging.getLogger("jungle_grid_leads_v2")
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    file_handler = logging.FileHandler(PIPELINE_LOG_PATH, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    logger.propagate = False
    return logger
