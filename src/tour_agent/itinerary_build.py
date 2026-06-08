"""일정 조립 — 봇은 '장소 목록(plan)'만 주고, 좌표·동선·시간은 코드가 결정적으로 채운다.

봇이 일정 전체(좌표·시간·카드)를 만들면 cli(구독)에서 느리고 부정확하다. 대신 봇은 가벼운
plan(날짜별 장소 이름)만 만들고, 여기서:
  1) Kakao 검색으로 좌표·링크(다른 지역 동명은 이상치로 제외)
  2) order_route(NN+2-opt)로 숙소 기준 방문 순서
  3) directions로 인접 실이동시간(route_finder 있을 때)
  4) 체류·이동 누적으로 시간 배분
  -> present_itinerary 카드(dict)를 만든다.
"""

from __future__ import annotations

import asyncio
import statistics

from .route import optimize_route

_REGION_TOL = 0.7  # 같은 여행 지역으로 볼 좌표 허용 반경(도)
_STAY_MIN = 90  # 장소별 기본 체류(분)


async def _first(place_finder, name: str):
    try:
        r = await place_finder(name)
    except Exception:  # noqa: BLE001
        return None
    return r[0] if r else None


async def _resolve_item(place_finder, it: dict):
    """항목을 검색해 (place, 표시이름, 남은 대안) 반환.

    주 이름이 검색에 없으면(봇이 지어낸 환각 등) 대안 맛집 이름을 차례로 검색해
    처음으로 잡히는 실제 가게로 대체한다. 어느 것도 못 찾으면 place=None.
    """
    name = it["name"]
    alts = [a for a in (it.get("alternatives") or []) if a]
    p = await _first(place_finder, name)
    if p:
        return p, name, alts
    for alt in alts:
        pa = await _first(place_finder, alt)
        if pa:
            return pa, alt, [a for a in alts if a != alt]
    return None, name, alts


def _hhmm(total_min: int) -> str:
    h, m = divmod(int(total_min), 60)
    return f"{h % 24:02d}:{m:02d}"


async def build_itinerary(plan, *, place_finder, route_finder=None, start_hour: int = 9):
    title = plan.get("title") or "여행 일정"
    days_out = []
    carry_acc = ""  # 봇이 어떤 날 accommodation을 빠뜨려도 앞 날의 숙소를 상속한다.

    for di, day in enumerate(plan.get("days", [])):
        is_first = di == 0
        acc_name = day.get("accommodation") or carry_acc
        if acc_name:
            carry_acc = acc_name
        raw = [it for it in day.get("items", []) if isinstance(it, dict) and it.get("name")]

        # 각 항목을 검색(없으면 대안으로 대체). items는 표시이름·남은 대안이 반영된 정규화 목록.
        resolved = list(await asyncio.gather(*(_resolve_item(place_finder, it) for it in raw))) if raw else []
        firsts = [r[0] for r in resolved]
        items = [{**raw[k], "name": resolved[k][1], "alternatives": resolved[k][2]} for k in range(len(raw))]
        acc_p = await _first(place_finder, acc_name) if acc_name else None

        coords = [(p.x, p.y) for p in [*firsts, acc_p] if p and p.x and p.y]
        if coords:
            cx = statistics.median(c[0] for c in coords)
            cy = statistics.median(c[1] for c in coords)

            def near(p) -> bool:
                return bool(p and p.x and p.y and abs(p.x - cx) <= _REGION_TOL and abs(p.y - cy) <= _REGION_TOL)
        else:
            def near(p) -> bool:  # noqa: ARG001
                return False

        # 권역 outlier 교정 — 같은 지역(near)이지만 중심에서 꽤 먼 항목은 동명 오매칭일 수 있어
        # 권역 중심을 bias로 재검색해 더 가까운 결과가 있으면 교체한다.
        for k in range(len(items)):
            p = firsts[k]
            if not (p and p.x and p.y and near(p)):
                continue
            if abs(p.x - cx) <= 0.25 and abs(p.y - cy) <= 0.25:
                continue
            try:
                r2 = await place_finder(items[k]["name"], x=cx, y=cy)
            except Exception:  # noqa: BLE001
                r2 = None
            if r2:
                np_ = r2[0]
                if np_ and np_.x and np_.y and (abs(np_.x - cx) + abs(np_.y - cy) < abs(p.x - cx) + abs(p.y - cy)):
                    firsts[k] = np_

        # 식사 칸 보강: 이름·대안 모두 권역에서 못 찾았으면 카테고리(맛집 키워드)로 권역을
        # 검색해 실제 가게로 채운다(봇이 지어낸 이름 대신 진짜 맛집). 식사가 아닌 항목은 건드리지 않는다.
        if coords:
            for k in range(len(items)):
                if firsts[k] and near(firsts[k]):
                    continue
                if not items[k].get("meal"):
                    continue
                kw = items[k].get("category") or "맛집"
                try:
                    r3 = await place_finder(kw, x=cx, y=cy)
                except Exception:  # noqa: BLE001
                    r3 = None
                hit = r3[0] if r3 else None
                if hit and near(hit):
                    firsts[k] = hit
                    items[k] = {**items[k], "name": hit.name}

        located = [(it, p) for it, p in zip(items, firsts) if near(p)]
        unlocated = [it for it, p in zip(items, firsts) if not near(p)]

        # 동선 정렬: 첫날은 숙소가 출발이 아니라 마지막(도착지에서 시작해 숙소 체크인으로 끝).
        # 둘째날부터는 숙소에서 출발한다.
        lodge_start = (not is_first) and acc_p is not None and near(acc_p)
        if lodge_start and located:
            order = optimize_route((acc_p.x, acc_p.y), [(p.x, p.y) for _, p in located])
            located = [located[i] for i in order]
        elif located:
            # 첫 항목(공항·도착지 등)에서 출발해 나머지를 동선 최적화로 잇는다.
            head = located[0]
            rest = located[1:]
            if rest:
                order = optimize_route((head[1].x, head[1].y), [(p.x, p.y) for _, p in rest])
                rest = [rest[i] for i in order]
            located = [head, *rest]

        items_out = []
        t = start_hour * 60
        prev = (acc_p.x, acc_p.y) if lodge_start else None
        # 둘째날부터는 숙소가 동선의 출발점 — 타임라인 맨 앞에 '{숙소} 출발'을 명시한다
        # (첫날의 '체크인'이 마지막에 붙는 것과 대칭). 지도엔 번호 핀으로 표시된다.
        if lodge_start:
            items_out.append({
                "name": f"{acc_name} 출발" if acc_name else "숙소 출발",
                "time": _hhmm(t),
                "category": "숙소",
                "x": acc_p.x, "y": acc_p.y, "place_url": acc_p.place_url,
                "travel_from_prev": "",
                "alternatives": [],
            })
        for it, p in located:
            travel = ""
            if route_finder is not None and prev is not None:
                try:
                    r = await route_finder(prev, (p.x, p.y))
                    mins = round(r.duration_s / 60)
                    travel = f"차 약 {mins}분"
                    t += mins
                except Exception:  # noqa: BLE001
                    pass
            items_out.append({
                "name": it["name"],
                "time": _hhmm(t),
                "category": it.get("category") or p.category,
                "x": p.x, "y": p.y, "place_url": p.place_url,
                "travel_from_prev": travel,
                "alternatives": [{"name": a} for a in (it.get("alternatives") or []) if a],
            })
            t += _STAY_MIN
            prev = (p.x, p.y)

        # 첫날은 숙소 체크인을 동선의 마지막에 코드가 직접 붙인다(숙소가 출발이 아님).
        if is_first and acc_p is not None and near(acc_p):
            travel = ""
            if route_finder is not None and prev is not None:
                try:
                    r = await route_finder(prev, (acc_p.x, acc_p.y))
                    mins = round(r.duration_s / 60)
                    travel = f"차 약 {mins}분"
                    t += mins
                except Exception:  # noqa: BLE001
                    pass
            items_out.append({
                "name": f"{acc_name} 체크인" if acc_name else "숙소 체크인",
                "time": _hhmm(t),
                "category": "숙소",
                "x": acc_p.x, "y": acc_p.y, "place_url": acc_p.place_url,
                "travel_from_prev": travel,
                "alternatives": [],
            })

        # 좌표를 못 찾은 항목은 동선에서 빼고 이름만 뒤에 둔다(지도엔 안 찍힘).
        for it in unlocated:
            items_out.append({
                "name": it["name"], "category": it.get("category", ""), "note": "위치 확인 필요",
                "alternatives": [{"name": a} for a in (it.get("alternatives") or []) if a],
            })

        # 숙소는 이제 타임라인 항목('출발'/'체크인')으로 들어가므로 별도 acc 핀은 두지 않는다.
        d = {"date": day.get("date"), "accommodation": acc_name, "items": items_out}
        days_out.append(d)

    return {"type": "itinerary", "title": title, "days": days_out}
