-- 채팅 메시지 영속 — 방의 대화(사람·봇·카드)를 append-only로 저장, 입장 시 복원·공유.
create table if not exists public.room_message (
  id         bigserial primary key,
  room_id    text not null,
  data       jsonb not null,
  created_at timestamptz default now()
);
create index if not exists room_message_room_idx on public.room_message(room_id, id);

alter table public.room_message enable row level security;

drop policy if exists "room_message public access" on public.room_message;
create policy "room_message public access" on public.room_message
  for all to anon, authenticated using (true) with check (true);

grant all on public.room_message to anon, authenticated;
grant usage, select on sequence public.room_message_id_seq to anon, authenticated;
