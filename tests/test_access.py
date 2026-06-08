from tour_agent.access import authorize_join, hash_token
from tour_agent.state import RoomState


def _state():
    return RoomState(room_id="r")


def test_open_mode_allows_anyone_when_no_admin_key():
    st = _state()
    d = authorize_join(st, {"name": "민수"}, admin_key="")
    assert d.ok and d.save_needed is False


def test_open_mode_owner_flag_from_token():
    st = _state()
    d = authorize_join(st, {"name": "민수", "ownerToken": "tok"}, admin_key="")
    assert d.ok and d.is_owner is True


def test_gated_create_requires_admin_key():
    st = _state()
    d = authorize_join(st, {"name": "민수", "ownerToken": "tok"}, admin_key="SECRET")
    assert d.ok is False and "관리자" in d.reason
    assert not st.access  # 방이 생성되지 않음


def test_gated_create_with_admin_key_claims_room_and_returns_invite():
    st = _state()
    d = authorize_join(
        st, {"name": "민수", "adminKey": "SECRET", "ownerToken": "tok"}, admin_key="SECRET"
    )
    assert d.ok and d.is_owner and d.save_needed
    assert d.invite_code  # 초대 코드 발급
    assert st.access["owner_hash"] == hash_token("tok")
    assert st.access["invite"] == d.invite_code


def test_gated_existing_room_owner_token_admits_as_owner():
    st = _state()
    st.access = {"owner_hash": hash_token("tok"), "invite": "INV123"}
    d = authorize_join(st, {"name": "민수", "ownerToken": "tok"}, admin_key="SECRET")
    assert d.ok and d.is_owner and d.save_needed is False


def test_gated_existing_room_invite_admits_as_guest():
    st = _state()
    st.access = {"owner_hash": hash_token("tok"), "invite": "INV123"}
    d = authorize_join(st, {"name": "영희", "inviteCode": "INV123"}, admin_key="SECRET")
    assert d.ok and d.is_owner is False


def test_gated_existing_room_rejects_without_credentials():
    st = _state()
    st.access = {"owner_hash": hash_token("tok"), "invite": "INV123"}
    d = authorize_join(st, {"name": "외부인", "inviteCode": "WRONG"}, admin_key="SECRET")
    assert d.ok is False and "초대" in d.reason


def test_admin_key_on_existing_room_does_not_leak_owner():
    """관리자 키만 있고 토큰/초대코드 없으면 기존 방엔 입장 못 한다(생성 전용)."""
    st = _state()
    st.access = {"owner_hash": hash_token("tok"), "invite": "INV123"}
    d = authorize_join(st, {"name": "x", "adminKey": "SECRET"}, admin_key="SECRET")
    assert d.ok is False
