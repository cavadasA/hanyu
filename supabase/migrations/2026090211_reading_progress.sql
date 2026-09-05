-- Progreso localizable por usuario: reanudar, marcar y evitar repetir lecturas.
create table if not exists public.reading_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reading_slug text not null references public.reading(slug) on delete cascade,
  bookmarked boolean not null default false,
  last_sentence integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, reading_slug)
);

create index if not exists idx_reading_progress_finished
  on public.reading_progress(user_id, finished_at desc);

alter table public.reading_progress enable row level security;

drop policy if exists reading_progress_select_own on public.reading_progress;
create policy reading_progress_select_own on public.reading_progress
for select using (user_id = auth.uid());

drop policy if exists reading_progress_write_own on public.reading_progress;
create policy reading_progress_write_own on public.reading_progress
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
