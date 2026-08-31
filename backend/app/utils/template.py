"""命令模板占位符解析。

命令内容中支持 ``{参数名}`` 占位符（requirements.md §11），前端据此生成参数表单。
"""

from __future__ import annotations

import re

_PLACEHOLDER_RE = re.compile(r"\{([^{}]+)\}")


def extract_template_params(content: str) -> list[str]:
    """按出现顺序提取命令中的参数名，去重。"""
    seen: list[str] = []
    for name in _PLACEHOLDER_RE.findall(content or ""):
        name = name.strip()
        if name and name not in seen:
            seen.append(name)
    return seen


def has_template_params(content: str) -> bool:
    return bool(_PLACEHOLDER_RE.search(content or ""))
