-- supabase/migrations/2026090601_analytics.sql
--
-- La velocidad de lectura con pinyin visible y sin él son dos cosas distintas:
-- con pinyin se está leyendo una transcripción. Sin esta columna, la métrica
-- promedia las dos y no mide ninguna.
alter table public.reading_progress
  add column if not exists pinyin_shown boolean;
