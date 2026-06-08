"""SupabaseRowStore(httpx 어댑터) — PostgREST 호출을 MockTransport로 검증(네트워크 없음)."""

import json

import httpx

from tour_agent.supabase_store import SupabaseMessageStore, SupabaseRowStore


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_message_append_posts_row():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["method"] = req.method
        seen["url"] = str(req.url)
        seen["body"] = req.content
        return httpx.Response(201, json=[])

    ms = SupabaseMessageStore("https://x.supabase.co", "KEY", client=_client(handler))
    await ms.append("r", {"speaker": "민수", "text": "hi"})

    assert seen["method"] == "POST" and "room_message" in seen["url"]
    assert json.loads(seen["body"]) == {"room_id": "r", "data": {"speaker": "민수", "text": "hi"}}


async def test_message_delete_issues_delete_filtered_by_mid():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["method"] = req.method
        seen["url"] = str(req.url)
        return httpx.Response(204)

    ms = SupabaseMessageStore("https://x.supabase.co", "KEY", client=_client(handler))
    await ms.delete("r", "abc123")

    assert seen["method"] == "DELETE" and "room_message" in seen["url"]
    assert "room_id=eq.r" in seen["url"]
    assert "eq.abc123" in seen["url"]  # data->>mid=eq.abc123 (인코딩 포함)


async def test_message_recent_synthesizes_mid_for_legacy_rows():
    """mid 없는 옛 행은 행 id로 합성 mid(__row{id})를 붙여 삭제 가능하게 한다."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[
            {"id": 7, "data": {"speaker": "봇", "text": "new", "mid": "realmid"}},
            {"id": 5, "data": {"speaker": "봇", "text": "old"}},
        ])

    ms = SupabaseMessageStore("https://x.supabase.co", "KEY", client=_client(handler))
    out = await ms.recent("r")  # id.desc → 시간순으로 뒤집힘 → old(5), new(7)
    assert out[0]["text"] == "old" and out[0]["mid"] == "__row5"  # 합성 mid
    assert out[1]["mid"] == "realmid"  # 기존 mid는 유지


async def test_message_delete_legacy_row_by_id():
    """합성 mid(__row{id})로 삭제 요청하면 행 id로 삭제한다."""
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["method"] = req.method
        return httpx.Response(204)

    ms = SupabaseMessageStore("https://x.supabase.co", "KEY", client=_client(handler))
    await ms.delete("r", "__row5")

    assert seen["method"] == "DELETE"
    assert "id=eq.5" in seen["url"] and "room_id=eq.r" in seen["url"]


async def test_message_recent_returns_chronological():
    def handler(req: httpx.Request) -> httpx.Response:
        # PostgREST는 order=id.desc로 최신순 반환 → 스토어가 시간순으로 뒤집어야 한다.
        assert "order=id.desc" in str(req.url)
        return httpx.Response(200, json=[{"data": {"text": "2"}}, {"data": {"text": "1"}}])

    ms = SupabaseMessageStore("https://x.supabase.co", "KEY", client=_client(handler))
    out = await ms.recent("r", limit=10)
    assert [m["text"] for m in out] == ["1", "2"]


async def test_get_returns_data_when_row_exists():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["method"] = req.method
        seen["url"] = str(req.url)
        seen["apikey"] = req.headers.get("apikey")
        seen["auth"] = req.headers.get("authorization")
        return httpx.Response(200, json=[{"data": {"room_id": "r", "destination": "제주"}}])

    rows = SupabaseRowStore("https://x.supabase.co", "KEY", client=_client(handler))
    data = await rows.get("r")

    assert data == {"room_id": "r", "destination": "제주"}
    assert seen["method"] == "GET"
    assert "room_state" in seen["url"] and "room_id=eq.r" in seen["url"] and "select=data" in seen["url"]
    assert seen["apikey"] == "KEY"
    assert seen["auth"] == "Bearer KEY"


async def test_get_returns_none_when_no_row():
    def handler(req):
        return httpx.Response(200, json=[])

    rows = SupabaseRowStore("https://x.supabase.co", "KEY", client=_client(handler))
    assert await rows.get("missing") is None


async def test_upsert_posts_row_with_merge_prefer():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["method"] = req.method
        seen["url"] = str(req.url)
        seen["prefer"] = req.headers.get("prefer")
        seen["body"] = req.content
        return httpx.Response(201, json=[{"room_id": "r"}])

    rows = SupabaseRowStore("https://x.supabase.co", "KEY", client=_client(handler))
    await rows.upsert("r", {"room_id": "r", "destination": "제주"})

    import json as _json

    assert seen["method"] == "POST"
    assert "room_state" in seen["url"]
    assert "merge-duplicates" in (seen["prefer"] or "")
    body = _json.loads(seen["body"])
    assert body == {"room_id": "r", "data": {"room_id": "r", "destination": "제주"}}
