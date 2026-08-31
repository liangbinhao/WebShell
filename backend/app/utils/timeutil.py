"""时间工具：契约约定时间戳为 Unix 毫秒（number）。"""

from __future__ import annotations

import time


def now_ms() -> int:
    """当前 Unix 时间戳（毫秒）。"""
    return int(time.time() * 1000)
