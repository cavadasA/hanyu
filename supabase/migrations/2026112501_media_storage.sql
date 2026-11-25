-- Plan 10, Tarea 2: medios del repositorio servidos desde Storage.
--
-- Cada fichero se publica como media/<sha256>.<ext>: inmutable y cacheable
-- para siempre. Regrabar un clip produce otro hash, así que nunca hay que
-- invalidar nada. El repositorio es la fuente de verdad; Storage es la CDN.
-- Lo sube scripts/sync-media.js con la service_role en la CI.

insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'media');

drop policy if exists media_service_write on storage.objects;
create policy media_service_write on storage.objects for insert to service_role
  with check (bucket_id = 'media');

-- Plan 10, Tarea 3: audio por frase. Un elemento por frase de `sentences`:
-- {path, duration_ms} con path = '<bucket>/<objeto>' de media-index.json, o
-- null si la lectura no tiene audio (audio_kind = 'tts'). audio_kind se deriva
-- en la build del manifiesto de la lectura; un único audio_url por lectura no
-- permite resaltar la frase que suena, así que desaparece.
alter table public.reading add column if not exists sentence_audio jsonb not null default '[]'::jsonb;

alter table public.reading drop constraint if exists reading_audio_kind_check;
alter table public.reading add constraint reading_audio_kind_check
  check (audio_kind in ('tts', 'neural', 'human'));

alter table public.reading drop column if exists audio_url;
