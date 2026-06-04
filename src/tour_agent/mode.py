"""실행 모드 선택 — SDK-free.

BACKEND=api  -> ApiAgentRunner (Messages API, 서버리스/프로덕션, 권위 있는 구현)
BACKEND=cli  -> CliAgentRunner (claude-code CLI/구독, 로컬·개발용)
"""

from __future__ import annotations

import os
from enum import Enum


class Backend(str, Enum):
    API = "api"
    CLI = "cli"

    @classmethod
    def from_env(cls, default: str = "api") -> "Backend":
        raw = os.environ.get("BACKEND", default).strip().lower()
        try:
            return cls(raw)
        except ValueError:
            raise ValueError(
                f"BACKEND 값이 잘못됐습니다: {raw!r}. 'api' 또는 'cli' 중 하나여야 합니다."
            )
