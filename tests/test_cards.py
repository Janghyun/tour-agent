from tour_agent.api_runner import ApiAgentRunner
from tour_agent.cards import present_tools


async def _noop(_card):
    pass


def test_present_tools_expose_card_types():
    names = {t.name for t in present_tools(_noop)}
    assert names == {"present_place_options", "present_itinerary", "present_map", "present_compare"}


async def test_present_itinerary_enriches_with_place_finder():
    from tour_agent.kakao import Place

    emitted = []

    async def emit(card):
        emitted.append(card)

    async def finder(q):
        return [Place("1", q, "명소", "", "addr", 126.5, 33.5, "http://k/" + q)]

    tools = {t.name: t for t in present_tools(emit, place_finder=finder)}
    await tools["present_itinerary"].handler({"days": [{"items": [{"name": "성산일출봉"}]}]})

    item = emitted[0]["days"][0]["items"][0]
    assert item["x"] == 126.5 and item["y"] == 33.5  # 실좌표로 보강
    assert item["place_url"] == "http://k/성산일출봉"  # 실링크로 보강


async def test_present_itinerary_without_finder_keeps_payload():
    emitted = []

    async def emit(card):
        emitted.append(card)

    tools = {t.name: t for t in present_tools(emit)}  # place_finder 없음
    await tools["present_itinerary"].handler({"days": [{"items": [{"name": "성산"}]}]})
    assert emitted[0]["days"][0]["items"][0] == {"name": "성산"}  # 그대로


async def test_present_compare_emits_card_and_acks():
    emitted = []

    async def emit(card):
        emitted.append(card)

    tools = {t.name: t for t in present_tools(emit)}
    payload = {
        "title": "점심 후보 비교",
        "slot": "1일차 점심",
        "options": [
            {"name": "돈사돈", "category": "흑돼지", "note": "두꺼운 근고기"},
            {"name": "우진해장국", "category": "해장국", "note": "고사리 육개장"},
        ],
    }
    ack = await tools["present_compare"].handler(payload)

    assert emitted == [{"type": "compare", **payload}]
    assert "카드" in ack


async def test_present_itinerary_emits_card_and_acks_to_model():
    emitted = []

    async def emit(card):
        emitted.append(card)

    tools = {t.name: t for t in present_tools(emit)}
    payload = {"title": "제주 2일", "days": [{"items": [{"name": "성산일출봉"}]}]}
    ack = await tools["present_itinerary"].handler(payload)

    assert emitted == [{"type": "itinerary", "title": "제주 2일", "days": [{"items": [{"name": "성산일출봉"}]}]}]
    assert "카드" in ack  # 모델에는 짧은 확인만 돌려준다


async def test_runner_emits_card_when_model_calls_present_tool():
    emitted = []

    async def emit(card):
        emitted.append(card)

    scripted = [
        {
            "stop_reason": "tool_use",
            "content": [
                {
                    "type": "tool_use",
                    "id": "t1",
                    "name": "present_itinerary",
                    "input": {"title": "제주", "days": [{"items": [{"name": "우도"}]}]},
                }
            ],
        },
        {"stop_reason": "end_turn", "content": [{"type": "text", "text": "일정을 정리했어요"}]},
    ]
    calls = []

    async def model(messages, tools, system):
        calls.append(1)
        return scripted[len(calls) - 1]

    runner = ApiAgentRunner(model, present_tools(emit), system="s")
    out = await runner.run_turn("@봇 일정 짜줘")

    assert out == "일정을 정리했어요"
    assert emitted[0]["type"] == "itinerary"
    assert emitted[0]["title"] == "제주"
