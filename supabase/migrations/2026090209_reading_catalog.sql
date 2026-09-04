-- generated_readings guardaba el texto y poco más: ni tema, ni traducción por
-- frase, ni qué enseña la lectura. El catálogo curado vive en public.reading.

create table if not exists public.reading (
  slug text primary key,
  hsk_level integer not null check (hsk_level between 1 and 3),
  format text not null check (format in ('short_text', 'story', 'dialogue')),
  title text not null,
  topic text not null,
  series text,
  series_index integer,
  -- Una frase por elemento: {zh, pinyin, es}. La segmentación es del autor,
  -- porque el lector la usa para alinear la traducción y el audio.
  sentences jsonb not null,
  questions jsonb not null default '[]'::jsonb,
  -- 'tts' mientras no haya grabación humana.
  audio_kind text not null default 'tts' check (audio_kind in ('tts', 'human')),
  audio_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reading_level_topic on public.reading(hsk_level, topic);
create unique index if not exists idx_content_item_source
  on public.content_item(source_table, source_id);

alter table public.reading enable row level security;

drop policy if exists reading_select_authenticated on public.reading;
create policy reading_select_authenticated on public.reading
for select using (auth.role() = 'authenticated');

grant select on public.reading to authenticated;

-- Qué enseña cada lectura, en la tabla que el Plan 1C creó y dejó vacía.
insert into public.content_item (kind, hsk_level, title, source_table, source_id)
select 'reading', r.hsk_level, r.title, 'reading', r.slug
from public.reading r
on conflict (source_table, source_id) do update
set hsk_level = excluded.hsk_level, title = excluded.title;

-- generated_readings queda para el histórico de intentos y deja de servir
-- contenido. reading_attempts la sigue referenciando.
comment on table public.generated_readings is
  'Obsoleta desde el Plan 7. El catálogo vive en public.reading.';
