alter table public.rooms
  add column if not exists turn_seconds int not null default 0;

alter table public.rooms
  add column if not exists spectator_code text;

alter table public.rooms
  alter column spectator_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

alter table public.games
  add column if not exists turn_deadline_at timestamptz;

update public.rooms
set spectator_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
where spectator_code is null;

alter table public.rooms
  alter column spectator_code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_turn_seconds_check'
  ) then
    alter table public.rooms
      add constraint rooms_turn_seconds_check check (turn_seconds in (0, 30, 45, 60));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_spectator_code_key'
  ) then
    alter table public.rooms
      add constraint rooms_spectator_code_key unique (spectator_code);
  end if;
end $$;

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists idx_room_messages_room_created
on public.room_messages(room_id, created_at desc);

alter table public.room_messages enable row level security;

drop policy if exists "room_messages_select_members" on public.room_messages;
create policy "room_messages_select_members" on public.room_messages
for select using (public.is_room_member(room_id));

drop policy if exists "room_messages_insert_members" on public.room_messages;
create policy "room_messages_insert_members" on public.room_messages
for insert with check (
  public.is_room_member(room_id) and auth.uid() = user_id
);

alter table public.room_events drop constraint if exists room_events_type_check;
alter table public.room_events add constraint room_events_type_check check (
  type in (
    'player_joined',
    'secret_set',
    'turn_made',
    'game_finished',
    'rematch_requested',
    'rematch_started',
    'player_left',
    'chat_message',
    'turn_timeout',
    'settings_updated'
  )
);
