"""방 상태(진실의 원천) — 후보 풀 / 작업 일정 / 확정 일정 / 숙소 / 선호.

설계 결정:
- 앱 상태가 진실의 원천이고, SDK 세션은 휘발성 캐시다. 재개는 상태 + 방 요약으로 재구성한다.
- 방마다 단일 '작업 중 일정'. 확정은 그 시점을 복제한 스냅샷(이후 작업 변경과 무관).
- 선호는 구조화 행으로 저장(pgvector·임베딩은 v1 보류).

StateStore는 인터페이스다. 인메모리 구현은 결정적으로 검증하고, Supabase 구현은 seam.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
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

    def set_preference(self, traveler: str, target: str, sentiment: str) -> None:
        """여행자별 (target) 선호를 토글한다. 같은 감정을 다시 주면 해제, 반대면 교체."""
        existing = next(
            (p for p in self.preferences if p.traveler == traveler and p.target == target),
            None,
        )
        self.preferences = [
            p for p in self.preferences if not (p.traveler == traveler and p.target == target)
        ]
        if existing is None or existing.sentiment != sentiment:
            self.preferences.append(Preference(traveler, target, sentiment))

    def to_dict(self) -> dict:
        return {
            "room_id": self.room_id,
            "destination": self.destination,
            "dates": self.dates,
            "owner": self.owner,
            "candidates": [asdict(p) for p in self.candidates],
            "working_itinerary": [asdict(p) for p in self.working_itinerary],
            "confirmed_itinerary": (
                None
                if self.confirmed_itinerary is None
                else [asdict(p) for p in self.confirmed_itinerary]
            ),
            "accommodations": [asdict(p) for p in self.accommodations],
            "preferences": [asdict(pr) for pr in self.preferences],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "RoomState":
        confirmed = d.get("confirmed_itinerary")
        return cls(
            room_id=d["room_id"],
            destination=d.get("destination", ""),
            dates=d.get("dates", ""),
            owner=d.get("owner", ""),
            candidates=[Place(**p) for p in d.get("candidates", [])],
            working_itinerary=[Place(**p) for p in d.get("working_itinerary", [])],
            confirmed_itinerary=(
                None if confirmed is None else [Place(**p) for p in confirmed]
            ),
            accommodations=[Place(**p) for p in d.get("accommodations", [])],
            preferences=[Preference(**pr) for pr in d.get("preferences", [])],
        )


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


def itinerary_card_to_places(card: dict) -> list[Place]:
    """present_itinerary 카드(days/items) → 작업 일정용 Place 목록으로 평탄화."""
    places: list[Place] = []
    for day in card.get("days", []):
        for item in day.get("items", []):
            places.append(
                Place(
                    id="",
                    name=item.get("name", ""),
                    category=item.get("category", ""),
                    phone="",
                    address="",
                    x=float(item.get("x", 0.0)),
                    y=float(item.get("y", 0.0)),
                    place_url="",
                )
            )
    return places


def state_view(state: RoomState) -> dict:
    """프론트로 브로드캐스트할 방 상태의 직렬화 뷰."""
    return {
        "room_id": state.room_id,
        "destination": state.destination,
        "dates": state.dates,
        "owner": state.owner,
        "candidates": [
            {"id": p.id, "name": p.name, "category": p.category, "x": p.x, "y": p.y}
            for p in state.candidates
        ],
        "accommodations": [
            {"name": a.name, "x": a.x, "y": a.y} for a in state.accommodations
        ],
        "working_itinerary": [{"name": p.name} for p in state.working_itinerary],
        "confirmed": state.confirmed_itinerary is not None,
        "confirmed_itinerary": [
            {"name": p.name} for p in (state.confirmed_itinerary or [])
        ],
        "preferences": [
            {"traveler": pr.traveler, "target": pr.target, "sentiment": pr.sentiment}
            for pr in state.preferences
        ],
    }


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


# ── Supabase 구현 ───────────────────────────────────────────────────
# 같은 StateStore 인터페이스를 Supabase(Postgres) 한 행(JSONB)으로 구현한다.
# 구조화 테이블만 사용(pgvector·임베딩 v1 보류):
#   create table room_state (room_id text primary key, data jsonb not null,
#                            updated_at timestamptz default now());


class RowStore(Protocol):
    """room_state 한 행(room_id -> data dict) 접근의 최소 추상. 테스트는 인메모리 페이크."""

    async def get(self, room_id: str) -> dict | None: ...
    async def upsert(self, room_id: str, data: dict) -> None: ...


class SupabaseStateStore:
    """RowStore 위에 RoomState 직렬화로 구현한 StateStore.

    RowStore를 주입하므로 인메모리 페이크로 결정적 검증 가능. 실제 Supabase 어댑터는
    supabase-py(AsyncClient)로 room_state 테이블을 select/upsert 하면 된다(키·네트워크 환경에서
    런타임 검증할 seam):

        res = await client.table("room_state").select("data").eq("room_id", rid).execute()
        await client.table("room_state").upsert({"room_id": rid, "data": data}).execute()
    """

    def __init__(self, rows: RowStore):
        self._rows = rows

    async def load(self, room_id: str) -> RoomState:
        data = await self._rows.get(room_id)
        return RoomState.from_dict(data) if data else RoomState(room_id=room_id)

    async def save(self, state: RoomState) -> None:
        await self._rows.upsert(state.room_id, state.to_dict())
