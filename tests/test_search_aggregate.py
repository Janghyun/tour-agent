from tour_agent.kakao import Place
from tour_agent.search_aggregate import aggregate_search, make_place_finder


class Fake:
    def __init__(self, places):
        self.places = places
        self.calls = 0

    async def keyword_search(self, q, *, x=None, y=None, size=6):
        self.calls += 1
        return self.places


def _p(name, x=126.5, y=33.4):
    return Place("", name, "", "", "", x, y, "")


async def test_aggregate_merges_and_dedupes_by_name():
    a = Fake([_p("성산일출봉")])
    b = Fake([_p("성산 일출봉"), _p("우도")])  # '성산일출봉'과 공백만 다름 → 중복

    out = await aggregate_search("성산", [a, b])
    names = [p.name for p in out]

    assert "우도" in names
    assert sum(1 for n in names if "성산" in n) == 1  # 중복 제거(첫 소스 우선)
    assert names[0] == "성산일출봉"  # 첫 소스 결과 우선


async def test_aggregate_empty_sources():
    assert await aggregate_search("x", []) == []


async def test_make_place_finder_calls_all_sources():
    a, b = Fake([_p("A")]), Fake([_p("B")])
    finder = make_place_finder([a, b])
    out = await finder("q")
    assert {p.name for p in out} == {"A", "B"}
    assert a.calls == 1 and b.calls == 1
