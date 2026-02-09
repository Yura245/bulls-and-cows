alter table public.rooms
  add column if not exists music_track_index int not null default 0;

alter table public.rooms
  add column if not exists music_is_playing boolean not null default false;

alter table public.rooms
  add column if not exists music_started_at timestamptz;

alter table public.rooms
  add column if not exists music_updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_music_track_index_check'
  ) then
    alter table public.rooms
      add constraint rooms_music_track_index_check check (music_track_index >= 0);
  end if;
end $$;

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
    'settings_updated',
    'music_updated'
  )
);
