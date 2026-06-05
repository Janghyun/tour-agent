-- 내보낸 일정 기록(방 멤버 공유) — append-only, 방별로 다시 보기.
create table if not exists public.room_export (
  id         bigserial primary key,
  room_id    text not null,
  data       jsonb not null,
  created_at timestamptz default now()
);
create index if not exists room_export_room_idx on public.room_export(room_id, id);

alter table public.room_export enable row level security;

drop policy if exists "room_export public access" on public.room_export;
create policy "room_export public access" on public.room_export
  for all to anon, authenticated using (true) with check (true);

grant all on public.room_export to anon, authenticated;
grant usage, select on sequence public.room_export_id_seq to anon, authenticated;
