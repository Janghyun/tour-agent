"""방 상태(진실의 원천) — 후보 풀 / 작업 일정 / 확정 일정 / 숙소 / 선호.

설계 결정:
- 앱 상태가 진실의 원천이고, SDK 세션은 휘발성 캐시다. 재개는 상태 + 방 요약으로 재구성한다.
- 방마다 단일 '작업 중 일정'. 확정은 그 시점을 복제한 스냅샷(이후 작업 변경과 무관).
- 선호는 구조화 행으로 저장(pgvector·임베딩은 v1 보류).

StateStore는 인터페이스다. 인메모리 구현은 결정적으로 검증하고, Supabase 구현은 seam.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from .kakao import Place


@dataclass(frozen=True)
class Preference:
    traveler: str
    target: str  # 카테고리 또는 장소명
    sentiment: str  # "like" | "dislike"


@dataclass
class RoomState:
    room_id: str
    destination: str = ""
    dates: str = ""
    owner: str = ""  # 방장(여행자 식별자)
    candidates: list[Place] = field(default_factory=list)
    working_itinerary: list[Place] = field(default_factory=list)
    confirmed_itinerary: list[Place] | None = None
    accommodations: list[Place] = field(default_factory=list)  # 박별 거점
    preferences: list[Preference] = field(default_factory=list)

    def add_candidate(self, place: Place) -> None:
        if all(p.id != place.id for p in self.candidates):  # id 기준 중복 제거
            self.candidates.append(place)

    def remove_candidate(self, place_id: str) -> None:
        self.candidates = [p for p in self.candidates if p.id != place_id]

    def set_working_itinerary(self, stops: list[Place]) -> None:
        self.working_itinerary = list(stops)

    def confirm(self) -> None:
        """방장이 작업 중 일정을 확정 — 현재 시점을 복제한 스냅샷으로 고정."""
        self.confirmed_itinerary = list(self.working_itinerary)

    def add_preference(self, traveler: str, target: str, sentiment: str) -> None:
        self.preferences.append(Preference(traveler, target, sentiment))


def room_snapshot(state: RoomState) -> str:
    """세션 재개·치프 경로 주입용 압축 요약."""
    parts: list[str] = []
    if state.destination:
        parts.append(f"목적지: {state.destination}")
    if state.dates:
        parts.append(f"기간: {state.dates}")
    if state.accommodations:
        parts.append("숙소: " + ", ".join(a.name for a in state.accommodations))
    if state.confirmed_itinerary:
        parts.append(
            "확정 일정: " + " -> ".join(p.name for p in state.confirmed_itinerary)
        )
    elif state.working_itinerary:
        parts.append(
            "작업 중 일정: " + " -> ".join(p.name for p in state.working_itinerary)
        )
    return " / ".join(parts)


class StateStore(Protocol):
    async def load(self, room_id: str) -> RoomState: ...
    async def save(self, state: RoomState) -> None: ...


class InMemoryStateStore:
    """프로세스 메모리 기반 스토어(테스트·로컬용). Supabase 구현으로 교체 가능."""

    def __init__(self):
        self._rooms: dict[str, RoomState] = {}

    async def load(self, room_id: str) -> RoomState:
        return self._rooms.get(room_id) or RoomState(room_id=room_id)

    async def save(self, state: RoomState) -> None:
        self._rooms[state.room_id] = state


# ── Supabase 구현(seam) ─────────────────────────────────────────────
# 같은 StateStore 인터페이스를 Supabase(Postgres)로 구현한다. 구조화 테이블만 쓴다
# (pgvector·임베딩은 v1 보류). 아래는 단일 JSONB 컬럼에 방 상태를 직렬화하는 최소 스케치다.
#
#   create table room_state (room_id text primary key, data jsonb not null,
#                            updated_at timestamptz default now());
#
# class SupabaseStateStore:
#     def __init__(self, url: str, key: str):
#         from supabase import create_client      # 지연 임포트(seam)
#         self._db = create_client(url, key)
#     async def load(self, room_id: str) -> RoomState:
#         row = self._db.table("room_state").select("data").eq("room_id", room_id).execute()
#         return _from_json(room_id, row.data) if row.data else RoomState(room_id=room_id)
#     async def save(self, state: RoomState) -> None:
#         self._db.table("room_state").upsert(
#             {"room_id": state.room_id, "data": _to_json(state)}
#         ).execute()
#
# _to_json/_from_json 은 RoomState <-> dict 직렬화. supabase-py·키 환경에서 런타임 검증 필요.
