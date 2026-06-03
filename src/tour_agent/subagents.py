"""서브에이전트 3종 정의 + 작업 경로 에이전트 배선(seam).

설계 결정:
- '일정 설계'와 '검증'은 격리 컨텍스트의 LLM 서브에이전트.
- '동선 최적화'는 LLM 서브에이전트가 아니라 **결정적 툴**(itinerary.order_route_tool)이다.
  LLM은 방문 순서를 발명하지 않는다.

프롬프트 상수는 검증 가능한 자료다. SDK 배선(build_task_agent)은
claude_agent_sdk를 지연 임포트하는 seam이며, SDK·키 환경에서 런타임 검증이 필요하다.
"""

from __future__ import annotations

DESIGN_SYSTEM = (
    "너는 '일정 설계' 서브에이전트다. 후보 장소 목록과 숙소·기간·그룹 선호가 주어진다. "
    "하루에 무리 없는 수의 장소를 고른다. **방문 순서는 정하지 마라** — 동선 최적화는 "
    "별도의 결정적 도구가 한다. 너는 '어떤 곳을 넣을지'만 고른다."
)

VERIFY_SYSTEM = (
    "너는 '검증' 서브에이전트다. 동선 정렬이 끝난 일정의 각 장소에 대해 WebSearch로 "
    "영업시간·휴무·예약 필요 여부를 확인한다. 문제가 있으면 표시하되, 영업시간은 "
    "단정하지 말고 '확인 필요' 톤으로 안내한다."
)

ORCHESTRATOR_SYSTEM = (
    "너는 여행 일정 오케스트레이터다. 다음 순서로 일정을 만든다: "
    "(1) '일정 설계' 서브에이전트로 후보 중 갈 곳을 고르고, "
    "(2) order_route 도구로 숙소 기준 방문 순서를 정하고(직접 순서를 지어내지 말 것), "
    "(3) '검증' 서브에이전트로 영업시간 등을 확인한 뒤, "
    "(4) present_itinerary로 카드를 만든다. "
    "bash·파일편집 같은 위험 도구는 절대 쓰지 않는다."
)


def build_task_agent(kakao_client):
    """작업 경로용 AgentConfig를 조립한다(지연 임포트 seam).

    구성: Kakao 검색/동선 툴 + order_route(결정적 동선) + WebSearch + present_* +
    '일정 설계'·'검증' 서브에이전트. allowed_tools 화이트리스트만 노출한다.

    ※ claude_agent_sdk 설치 환경에서 런타임 검증이 필요한 seam이다.
    """
    from claude_agent_sdk import AgentDefinition  # noqa: F401

    from .agent_backend import AgentConfig
    from .kakao_tools import build_kakao_tools

    kakao_server, kakao_tools = build_kakao_tools(kakao_client)

    subagents = {
        "design": AgentDefinition(
            description="일정 설계: 후보 중 갈 곳 선택",
            prompt=DESIGN_SYSTEM,
            tools=kakao_tools,
        ),
        "verify": AgentDefinition(
            description="검증: 영업시간·휴무 확인",
            prompt=VERIFY_SYSTEM,
            tools=["WebSearch"],
        ),
    }

    return AgentConfig(
        system_prompt=ORCHESTRATOR_SYSTEM,
        allowed_tools=[*kakao_tools, "WebSearch"],
        mcp_servers={"kakao": kakao_server},
        # 서브에이전트는 SDK 옵션으로 전달(배선 지점). 모델 티어는 균형 티어.
        model="claude-sonnet-4-6",
    ), subagents
