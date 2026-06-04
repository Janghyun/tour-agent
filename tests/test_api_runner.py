from tour_agent.api_runner import ApiAgentRunner, ApiClassifier, ToolSpec


def _tool(name, handler):
    return ToolSpec(
        name=name,
        description=f"{name} 도구",
        input_schema={"type": "object", "properties": {"query": {"type": "string"}}},
        handler=handler,
    )


async def test_returns_text_without_any_tool_call():
    async def model(messages, tools, system):
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "안녕!"}]}

    runner = ApiAgentRunner(model, [], system="s")
    assert await runner.run_turn("안녕") == "안녕!"


async def test_runs_tool_then_returns_final_text():
    tool_calls = []

    async def search(args):
        tool_calls.append(args)
        return "성산 흑돼지 3곳"

    scripted = [
        {
            "stop_reason": "tool_use",
            "content": [
                {
                    "type": "tool_use",
                    "id": "t1",
                    "name": "search_places",
                    "input": {"query": "성산 흑돼지"},
                }
            ],
        },
        {"stop_reason": "end_turn", "content": [{"type": "text", "text": "추천: 흑돼지집!"}]},
    ]
    requests = []

    async def model(messages, tools, system):
        requests.append([m for m in messages])
        return scripted[len(requests) - 1]

    runner = ApiAgentRunner(model, [_tool("search_places", search)], system="여행 도우미")
    out = await runner.run_turn("@봇 성산 흑돼지 찾아줘")

    assert out == "추천: 흑돼지집!"
    assert tool_calls == [{"query": "성산 흑돼지"}]
    # 두 번째 모델 호출에는 tool_result가 되먹임되어 있어야 한다.
    assert any(
        isinstance(m.get("content"), list)
        and any(b.get("type") == "tool_result" for b in m["content"])
        for m in requests[1]
    )


async def test_unknown_tool_does_not_crash():
    scripted = [
        {
            "stop_reason": "tool_use",
            "content": [{"type": "tool_use", "id": "t1", "name": "nope", "input": {}}],
        },
        {"stop_reason": "end_turn", "content": [{"type": "text", "text": "처리했어요"}]},
    ]
    requests = []

    async def model(messages, tools, system):
        requests.append(messages)
        return scripted[len(requests) - 1]

    runner = ApiAgentRunner(model, [], system="s")
    out = await runner.run_turn("hi")

    assert out == "처리했어요"
    # 알 수 없는 도구는 오류 tool_result로 되먹임(크래시 없음)
    fed = requests[1][-1]["content"][0]["content"]
    assert "알 수 없는" in fed


async def test_classifier_maps_text_to_task_or_simple():
    async def model_task(messages, tools, system):
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "task"}]}

    async def model_simple(messages, tools, system):
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "simple 입니다"}]}

    assert await ApiClassifier(model_task).classify("@봇 일정 짜줘") == "task"
    assert await ApiClassifier(model_simple).classify("안녕") == "simple"


async def test_max_steps_guard_stops_infinite_tool_loop():
    async def again(args):
        return "again"

    async def model(messages, tools, system):
        return {
            "stop_reason": "tool_use",
            "content": [{"type": "tool_use", "id": "t", "name": "loop", "input": {}}],
        }

    runner = ApiAgentRunner(model, [_tool("loop", again)], system="s", max_steps=3)
    out = await runner.run_turn("hi")
    assert out  # 무한 루프 대신 안전한 폴백 문구 반환
