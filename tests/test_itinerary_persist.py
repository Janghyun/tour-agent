from tour_agent.state import RoomState, itinerary_card_to_places


def test_itinerary_card_flattens_days_items_to_places():
    card = {
        "title": "제주 2일",
        "days": [
            {"items": [{"name": "성산", "x": 126.9, "y": 33.4}, {"name": "우도", "x": 126.95, "y": 33.5}]},
            {"items": [{"name": "한라산", "category": "산"}]},
        ],
    }
    places = itinerary_card_to_places(card)
    assert [p.name for p in places] == ["성산", "우도", "한라산"]
    assert places[0].x == 126.9
    assert places[2].category == "산"


def test_empty_card():
    assert itinerary_card_to_places({"days": []}) == []
