"""应用配置（可通过环境变量覆盖，用于测试注入临时数据目录）。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# 默认数据目录：backend/data（与代码分离）
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: DEFAULT_DATA_DIR)
    # Host key 校验使用的 known_hosts 文件（不能默认关闭校验）
    known_hosts: Path = field(default_factory=lambda: Path.home() / ".ssh" / "known_hosts")
    # 导入来源：~/.ssh/config
    ssh_config_path: Path = field(default_factory=lambda: Path.home() / ".ssh" / "config")
    ssh_connect_timeout: float = 15.0
    # SSH keepalive：N 秒无流量时发送心跳，连续丢失超过上限视为断线
    ssh_keepalive: int = 30
    ssh_keepalive_count_max: int = 3
    # WebSocket 层 ping 间隔（秒）
    ws_ping_interval: float = 30.0
    # 历史记录上限
    history_max: int = 2000
    history_list_limit: int = 500
    # CORS：仅放行本机开发来源
    cors_allow_origin_regex: str = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

    @classmethod
    def from_env(cls) -> "Settings":
        data_dir = Path(os.environ.get("WS_DATA_DIR", str(DEFAULT_DATA_DIR)))
        known_hosts = Path(os.environ.get("WS_KNOWN_HOSTS", str(Path.home() / ".ssh" / "known_hosts")))
        ssh_config_path = Path(os.environ.get("WS_SSH_CONFIG", str(Path.home() / ".ssh" / "config")))
        return cls(data_dir=data_dir, known_hosts=known_hosts, ssh_config_path=ssh_config_path)
