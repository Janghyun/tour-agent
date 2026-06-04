from tour_agent.api_runner import ApiAgentRunner
from tour_agent.cards import present_tools


async def _noop(_card):
    pass


def test_present_tools_expose_three_card_types():
    names = {t.name for t in present_tools(_noop)}
    assert names == {"present_place_options", "present_itinerary", "present_map"}


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
