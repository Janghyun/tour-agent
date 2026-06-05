from tour_agent.messages import InMemoryMessageStore


async def test_append_and_recent_in_order():
    ms = InMemoryMessageStore()
    await ms.append("r", {"speaker": "민수", "text": "안녕"})
    await ms.append("r", {"speaker": "봇", "type": "card", "card": {"type": "itinerary"}})

    out = await ms.recent("r")
    assert out == [
        {"speaker": "민수", "text": "안녕"},
        {"speaker": "봇", "type": "card", "card": {"type": "itinerary"}},
    ]


async def test_recent_limit_keeps_latest():
    ms = InMemoryMessageStore()
    for i in range(10):
        await ms.append("r", {"speaker": "민수", "text": str(i)})
    out = await ms.recent("r", limit=3)
    assert [m["text"] for m in out] == ["7", "8", "9"]


async def test_rooms_are_isolated():
    ms = InMemoryMessageStore()
    await ms.append("a", {"text": "a1"})
    await ms.append("b", {"text": "b1"})
    assert [m["text"] for m in await ms.recent("a")] == ["a1"]
    assert [m["text"] for m in await ms.recent("b")] == ["b1"]
