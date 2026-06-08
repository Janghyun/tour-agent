"""방 입장 인가 — 누가 방을 만들고/들어올 수 있는지 백엔드에서 강제한다.

모델:
- ADMIN_KEY가 설정된 경우(프로덕션)만 게이팅. 미설정이면 모두 허용(로컬·개발).
- 방이 아직 없으면(미생성) **관리자 키**를 가진 사람만 생성할 수 있고, 생성 시 그 사람이
  방장(소유권 토큰)으로 등록되고 **초대 코드**가 발급된다.
- 이미 있는 방은 **소유권 토큰(방장)** 또는 **초대 코드(게스트)** 로만 입장한다.

토큰/코드는 클라이언트가 핸드셰이크로 보낸다(소유권 토큰은 해시만 저장).
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass


def hash_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def new_invite_code() -> str:
    return secrets.token_urlsafe(9)  # 추측 불가한 ~12자 코드


@dataclass
class JoinDecision:
    ok: bool
    is_owner: bool = False
    invite_code: str = ""
    reason: str = ""
    save_needed: bool = False  # 방을 새로 생성해 state를 저장해야 하면 True


def authorize_join(state, join: dict | None, *, admin_key: str, invite_factory=new_invite_code) -> JoinDecision:
    """입장 핸드셰이크(join)를 인가한다. 새 방 생성 시 state.access를 채운다(저장은 호출측)."""
    join = join or {}
    owner_token = join.get("ownerToken") or ""
    invite = join.get("inviteCode") or ""
    admin = join.get("adminKey") or ""

    if not admin_key:
        # 게이팅 비활성(로컬·개발) — 모두 허용. owner 여부는 소유권 토큰 보유로만 판단.
        return JoinDecision(ok=True, is_owner=bool(owner_token), invite_code=(state.access or {}).get("invite", ""))

    access = state.access or {}
    claimed = bool(access.get("owner_hash"))

    if not claimed:
        # 새 방 생성 — 관리자 키 필수 + 소유권 토큰 필수.
        if admin != admin_key:
            return JoinDecision(ok=False, reason="방을 만들려면 관리자 키가 필요해요.")
        if not owner_token:
            return JoinDecision(ok=False, reason="소유권 토큰이 없어요(앱을 새로고침해 주세요).")
        code = invite_factory()
        state.access = {"owner_hash": hash_token(owner_token), "invite": code}
        return JoinDecision(ok=True, is_owner=True, invite_code=code, save_needed=True)

    # 기존 방 — 방장 토큰 또는 초대 코드.
    if owner_token and hash_token(owner_token) == access.get("owner_hash"):
        return JoinDecision(ok=True, is_owner=True, invite_code=access.get("invite", ""))
    if invite and invite == access.get("invite"):
        return JoinDecision(ok=True, is_owner=False)
    return JoinDecision(ok=False, reason="초대 코드가 필요하거나 올바르지 않아요.")
