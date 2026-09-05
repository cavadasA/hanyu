-- Distingue una lectura iniciada en la primera frase de una lectura aún no abierta.
alter table public.reading_progress
  add column if not exists started_at timestamptz;
