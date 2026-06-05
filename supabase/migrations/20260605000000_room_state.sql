-- 여행 코스 에이전트 — 방 상태 영속 테이블.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행(1회).
-- 방 하나당 한 행, 상태 전체를 JSONB(data)로 저장한다(RoomState.to_dict / from_dict).

create table if not exists public.room_state (
  room_id    text primary key,
  data       jsonb not null,
  updated_at timestamptz default now()
);

-- publishable(anon) 키로 접근하므로 RLS 정책이 필요하다.
-- 주의: 아래는 방 코드를 아는 누구나 읽기/쓰기 가능한 MVP 정책이다(공개 방 협업 특성).
--       실서비스에서는 방 멤버십 검증으로 강화할 것.
alter table public.room_state enable row level security;

drop policy if exists "room_state public access" on public.room_state;
create policy "room_state public access" on public.room_state
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- 새 테이블에 anon/authenticated 권한이 자동 부여되지 않는 환경이면 아래도 실행:
grant all on public.room_state to anon, authenticated;
