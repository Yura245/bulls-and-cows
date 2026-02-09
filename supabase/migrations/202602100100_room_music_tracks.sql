create table if not exists public.room_music_tracks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  uploader_user_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 15728640),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_music_tracks_room_created
on public.room_music_tracks(room_id, created_at);

alter table public.room_music_tracks enable row level security;

drop policy if exists "room_music_tracks_select_members" on public.room_music_tracks;
create policy "room_music_tracks_select_members" on public.room_music_tracks
for select using (public.is_room_member(room_id));

drop policy if exists "room_music_tracks_insert_members" on public.room_music_tracks;
create policy "room_music_tracks_insert_members" on public.room_music_tracks
for insert with check (
  public.is_room_member(room_id) and auth.uid() = uploader_user_id
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-music',
  'room-music',
  false,
  15728640,
  array[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/mp4',
    'audio/x-m4a'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
