"""WebSocket 통합 테스트 — 실제 uvicorn 서버 + 실제 websockets 클라이언트.

(TestClient의 인메모리 스트림은 랑데부 방식이라 백그라운드 팬아웃과 교착할 수 있어,
프로덕션과 동일한 진짜 서버로 종단 검증한다.)
"""

import asyncio
import json
import threading

import uvicorn
import websockets

from tour_agent.app import create_app
from tour_agent.state import InMemoryStateStore


class EchoAgent:
    """프롬프트를 그대로 되울리는 테스트용 에이전트."""

    async def run_turn(self, prompt: str) -> str:
        return f"답변: {prompt}"


class _ServerThread:
    """uvicorn 서버를 백그라운드 스레드에서 띄우고 실제 포트를 노출한다."""

    def __init__(self, app):
        self._server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
        )
        self._thread = threading.Thread(target=self._server.run, daemon=True)

    async def __aenter__(self) -> int:
        self._thread.start()
        for _ in range(500):
            if self._server.started and self._server.servers:
                return self._server.servers[0].sockets[0].getsockname()[1]
            await asyncio.sleep(0.02)
        raise RuntimeError("서버가 시작되지 않았습니다")

    async def __aexit__(self, *exc) -> None:
        self._server.should_exit = True
        self._thread.join(timeout=5)


async def _recv_until(ws, type_, tries=6):
    for _ in range(tries):
        m = json.loads(await asyncio.wait_for(ws.recv(), 5))
        if m.get("type") == type_:
            return m
    raise AssertionError(f"{type_} 메시지를 받지 못함")


async def test_gated_create_with_admin_key_then_invite_join():
    store = InMemoryStateStore()
    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store, admin_key="SECRET", debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as owner:
            await owner.send(json.dumps({"join": {"name": "민수", "adminKey": "SECRET", "ownerToken": "tok-1"}}))
            adm = json.loads(await asyncio.wait_for(owner.recv(), 5))
            assert adm["type"] == "admitted" and adm["owner"] is True
            invite = adm["invite"]
            assert invite

            # 초대 코드로 게스트 입장 허용
            async with websockets.connect(uri) as guest:
                await guest.send(json.dumps({"join": {"name": "영희", "inviteCode": invite}}))
                g = json.loads(await asyncio.wait_for(guest.recv(), 5))
                assert g["type"] == "admitted" and g["owner"] is False


async def test_gated_rejects_without_admin_key_or_invite():
    store = InMemoryStateStore()
    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store, admin_key="SECRET", debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"join": {"name": "외부인"}}))  # 키도 초대코드도 없음
            m = json.loads(await asyncio.wait_for(ws.recv(), 5))
            assert m["type"] == "denied"


async def test_gated_rejects_non_handshake_first_message():
    store = InMemoryStateStore()
    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store, admin_key="SECRET", debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"speaker": "x", "text": "hi"}))  # 핸드셰이크 아님
            m = json.loads(await asyncio.wait_for(ws.recv(), 5))
            assert m["type"] == "denied"


async def test_gated_guest_cannot_confirm_itinerary():
    store = InMemoryStateStore()
    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store, admin_key="SECRET", debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as owner:
            await owner.send(json.dumps({"join": {"name": "민수", "adminKey": "SECRET", "ownerToken": "tok-1"}}))
            adm = await _recv_until(owner, "admitted")
            invite = adm["invite"]
            async with websockets.connect(uri) as guest:
                await guest.send(json.dumps({"join": {"name": "영희", "inviteCode": invite}}))
                await _recv_until(guest, "admitted")
                await guest.send(json.dumps({"action": "confirm_itinerary", "by": "영희"}))
                err = await _recv_until(guest, "error")
                assert "방장" in err["text"]


async def test_two_clients_bot_responds_only_on_explicit_call_and_broadcasts_to_all():
    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(), debounce_seconds=0.05
    )

    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws1, websockets.connect(uri) as ws2:
            await ws1.send(json.dumps({"speaker": "민수", "text": "우도 갈까?"}))  # 평범한 대화
            await ws2.send(json.dumps({"speaker": "영희", "text": "@봇 일정 짜줘"}))  # 명시적 호출

            # 사람 메시지 에코가 먼저 오므로 봇 응답까지 드레인한다.
            async def recv_bot(ws):
                for _ in range(6):
                    m = json.loads(await asyncio.wait_for(ws.recv(), 5))
                    if m.get("speaker") == "봇":
                        return m
                raise AssertionError("봇 응답을 받지 못함")

            r1 = await recv_bot(ws1)
            r2 = await recv_bot(ws2)

    # 봇은 명시적 호출에만 응답하고, 두 발화를 퍼널링한 맥락으로 답한다.
    assert r1["speaker"] == "봇"
    assert r1["text"].startswith("답변: ")
    assert "[민수] 우도 갈까?" in r1["text"]
    assert "[영희] @봇 일정 짜줘" in r1["text"]
    # 같은 브로드캐스트를 방의 모든 클라이언트가 받는다.
    assert r1 == r2


async def test_action_add_candidate_broadcasts_state():
    store = InMemoryStateStore()
    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store,
        debounce_seconds=0.05,
    )

    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(
                json.dumps(
                    {
                        "action": "add_candidate",
                        "place": {"id": "7", "name": "흑돼지집", "x": 126.9, "y": 33.4},
                    }
                )
            )
            # 입장 시 빈 상태 스냅샷이 먼저 오므로, 후보가 담긴 state까지 읽는다.
            msg = None
            for _ in range(5):
                m = json.loads(await asyncio.wait_for(ws.recv(), 5))
                if m.get("type") == "state" and m["state"]["candidates"]:
                    msg = m
                    break

    assert msg is not None
    assert [c["name"] for c in msg["state"]["candidates"]] == ["흑돼지집"]
    # 상태가 실제로 저장됐는지(재조회)
    saved = await store.load("jeju")
    assert [p.name for p in saved.candidates] == ["흑돼지집"]


async def test_state_snapshot_sent_on_join():
    """입장(새로고침) 직후, 액션 없이도 현재 방 상태(후보 등)가 와야 패널·지도가 복원된다."""
    from tour_agent.kakao import Place

    store = InMemoryStateStore()
    st = await store.load("jeju")
    st.add_candidate(Place("7", "흑돼지집", "음식점", "", "", 126.9, 33.4, "u"))
    await store.save(st)

    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store,
        debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            msg = json.loads(await asyncio.wait_for(ws.recv(), 5))

    assert msg["type"] == "state"
    assert [c["name"] for c in msg["state"]["candidates"]] == ["흑돼지집"]


async def test_join_heals_coordless_candidates():
    """기존에 좌표 없이 저장된 후보는 입장 시 검색으로 좌표를 채워(id 보존) 지도에 뜨게 한다."""
    from tour_agent.kakao import Place

    store = InMemoryStateStore()
    st = await store.load("jeju")
    st.add_candidate(Place("한라산", "한라산", "", "", "", 0.0, 0.0, ""))  # 좌표 없음
    await store.save(st)

    async def finder(q):
        return [Place("kk1", q, "명소", "", "제주", 126.53, 33.36, "u", source="kakao")]

    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store, place_finder=finder, debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            msg = json.loads(await asyncio.wait_for(ws.recv(), 5))

    assert msg["type"] == "state"
    c = msg["state"]["candidates"][0]
    assert c["x"] == 126.53 and c["y"] == 33.36  # 좌표 보강
    assert c["id"] == "한라산"  # id 보존(담음 배지·선호 유지)
    # 영속에도 반영(다음 입장부턴 재검색 안 함)
    assert (await store.load("jeju")).candidates[0].x == 126.53


async def test_itinerary_card_persists_to_working_itinerary():
    from tour_agent.api_runner import ApiAgentRunner
    from tour_agent.cards import present_tools

    store = InMemoryStateStore()
    scripted = [
        {
            "stop_reason": "tool_use",
            "content": [
                {
                    "type": "tool_use",
                    "id": "t",
                    "name": "present_itinerary",
                    "input": {"title": "제주", "days": [{"items": [{"name": "우도", "x": 126.95, "y": 33.5}]}]},
                }
            ],
        },
        {"stop_reason": "end_turn", "content": [{"type": "text", "text": "일정 완성"}]},
    ]
    calls = []

    async def model(messages, tools, system):
        calls.append(1)
        return scripted[len(calls) - 1]

    def factory(room_id, emit_card):
        return ApiAgentRunner(model, present_tools(emit_card), system="s")

    app = create_app(agent_factory=factory, store=store, debounce_seconds=0.05)
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"speaker": "민수", "text": "@봇 일정 짜줘"}))
            for _ in range(4):  # state·card·text 등 몇 개 흘려보냄
                try:
                    await asyncio.wait_for(ws.recv(), 5)
                except asyncio.TimeoutError:
                    break

    saved = await store.load("jeju")
    assert [p.name for p in saved.working_itinerary] == ["우도"]


async def test_slash_candidate_registers_via_finder():
    from tour_agent.kakao import Place

    store = InMemoryStateStore()

    async def finder(q):
        assert q == "성산일출봉"
        return [Place("1", "성산일출봉", "명소", "", "", 126.94, 33.46, "")]

    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store,
        place_finder=finder,
        debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"speaker": "민수", "text": "/후보 성산일출봉"}))
            got_state = False
            for _ in range(6):
                m = json.loads(await asyncio.wait_for(ws.recv(), 5))
                if m.get("type") == "state" and m["state"]["candidates"]:
                    got_state = True
                    break

    assert got_state
    saved = await store.load("jeju")
    assert [p.name for p in saved.candidates] == ["성산일출봉"]
    assert saved.candidates[0].x == 126.94  # 좌표까지 등록


async def test_add_place_by_link_registers():
    from tour_agent.kakao import Place

    store = InMemoryStateStore()

    async def resolver(url):
        assert "kakao" in url
        return "성산일출봉"

    async def finder(q):
        assert q == "성산일출봉"
        return [Place("1", "성산일출봉", "명소", "", "", 126.94, 33.46, "")]

    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(),
        store=store, place_finder=finder, url_resolver=resolver, debounce_seconds=0.05,
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"action": "add_place_by_link", "url": "https://place.map.kakao.com/123"}))
            got = False
            for _ in range(6):
                m = json.loads(await asyncio.wait_for(ws.recv(), 5))
                if m.get("type") == "state" and m["state"]["candidates"]:
                    got = True
                    break

    assert got
    saved = await store.load("jeju")
    assert [p.name for p in saved.candidates] == ["성산일출봉"]


async def test_message_history_sent_on_join():
    from tour_agent.messages import InMemoryMessageStore

    ms = InMemoryMessageStore()
    await ms.append("jeju", {"speaker": "민수", "text": "이전 대화"})
    await ms.append("jeju", {"speaker": "봇", "type": "card", "card": {"type": "itinerary"}})

    app = create_app(agent_factory=lambda room_id, emit_card: EchoAgent(), message_store=ms, debounce_seconds=0.05)
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            m1 = json.loads(await asyncio.wait_for(ws.recv(), 5))
            m2 = json.loads(await asyncio.wait_for(ws.recv(), 5))

    assert m1 == {"speaker": "민수", "text": "이전 대화", "history": True}
    assert m2["type"] == "card" and m2["card"]["type"] == "itinerary" and m2["history"] is True


async def test_chat_and_bot_reply_persisted():
    from tour_agent.messages import InMemoryMessageStore

    ms = InMemoryMessageStore()
    app = create_app(agent_factory=lambda room_id, emit_card: EchoAgent(), message_store=ms, debounce_seconds=0.05)
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"speaker": "민수", "text": "@봇 안녕"}))
            for _ in range(4):
                try:
                    await asyncio.wait_for(ws.recv(), 5)
                except asyncio.TimeoutError:
                    break

    texts = [m.get("text") for m in await ms.recent("jeju")]
    assert "@봇 안녕" in texts  # 사람 메시지 저장
    assert any(t and t.startswith("답변: ") for t in texts)  # 봇 응답도 저장


async def test_human_chat_broadcasts_to_room():
    app = create_app(
        agent_factory=lambda room_id, emit_card: EchoAgent(), debounce_seconds=0.05
    )
    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as a, websockets.connect(uri) as b:
            await a.send(json.dumps({"speaker": "민수", "text": "우도 갈까?"}))  # 평범한 대화
            ma = json.loads(await asyncio.wait_for(a.recv(), 5))
            mb = json.loads(await asyncio.wait_for(b.recv(), 5))

    # 사람 메시지가 방의 모두(보낸 사람 포함)에게 공유된다.
    assert ma == {"speaker": "민수", "text": "우도 갈까?"}
    assert mb == ma

