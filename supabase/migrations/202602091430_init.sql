create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  status text not null check (status in ('waiting_player', 'setting_secrets', 'active', 'finished')),
  host_user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  seat int not null check (seat in (1, 2)),
  is_online bool not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_no int not null check (round_no > 0),
  status text not null check (status in ('waiting_secrets', 'active', 'finished')),
  turn_seat int check (turn_seat in (1, 2)),
  winner_seat int check (winner_seat in (1, 2)),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, round_no)
);

create table if not exists public.game_secrets (
  game_id uuid not null references public.games(id) on delete cascade,
  seat int not null check (seat in (1, 2)),
  secret text check (secret ~ '^\d{4}$'),
  is_set bool not null default false,
  set_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (game_id, seat)
);

create table if not exists public.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  turn_no int not null check (turn_no > 0),
  guesser_seat int not null check (guesser_seat in (1, 2)),
  guess text not null check (guess ~ '^\d{4}$'),
  bulls int not null check (bulls between 0 and 4),
  cows int not null check (cows between 0 and 4),
  created_at timestamptz not null default now(),
  unique (game_id, turn_no)
);

create table if not exists public.rematch_votes (
  game_id uuid not null references public.games(id) on delete cascade,
  seat int not null check (seat in (1, 2)),
  voted bool not null default true,
  voted_at timestamptz not null default now(),
  primary key (game_id, seat)
);

create table if not exists public.room_events (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  type text not null check (
    type in (
      'player_joined',
      'secret_set',
      'turn_made',
      'game_finished',
      'rematch_requested',
      'rematch_started',
      'player_left'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_players_room on public.room_players(room_id);
create index if not exists idx_games_room on public.games(room_id, round_no desc);
create index if not exists idx_guesses_game on public.guesses(game_id, turn_no);
create index if not exists idx_room_events_room on public.room_events(room_id, id desc);

create or replace function public.is_room_member(target_room uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = target_room
      and rp.user_id = auth.uid()
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
alter table public.guesses enable row level security;
alter table public.rematch_votes enable row level security;
alter table public.room_events enable row level security;

drop policy if exists "rooms_select_members" on public.rooms;
create policy "rooms_select_members" on public.rooms
for select using (public.is_room_member(id));

drop policy if exists "rooms_insert_host" on public.rooms;
create policy "rooms_insert_host" on public.rooms
for insert with check (auth.uid() = host_user_id);

drop policy if exists "rooms_update_members" on public.rooms;
create policy "rooms_update_members" on public.rooms
for update using (public.is_room_member(id))
with check (public.is_room_member(id));

drop policy if exists "room_players_select_members" on public.room_players;
create policy "room_players_select_members" on public.room_players
for select using (public.is_room_member(room_id));

drop policy if exists "room_players_insert_self" on public.room_players;
create policy "room_players_insert_self" on public.room_players
for insert with check (auth.uid() = user_id);

drop policy if exists "room_players_update_self" on public.room_players;
create policy "room_players_update_self" on public.room_players
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "games_select_members" on public.games;
create policy "games_select_members" on public.games
for select using (public.is_room_member(room_id));

drop policy if exists "guesses_select_members" on public.guesses;
create policy "guesses_select_members" on public.guesses
for select using (
  exists (
    select 1
    from public.games g
    where g.id = guesses.game_id
      and public.is_room_member(g.room_id)
  )
);

drop policy if exists "votes_select_members" on public.rematch_votes;
create policy "votes_select_members" on public.rematch_votes
for select using (
  exists (
    select 1
    from public.games g
    where g.id = rematch_votes.game_id
      and public.is_room_member(g.room_id)
  )
);

drop policy if exists "events_select_members" on public.room_events;
create policy "events_select_members" on public.room_events
for select using (public.is_room_member(room_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_events'
  ) then
    alter publication supabase_realtime add table public.room_events;
  end if;
end $$;
