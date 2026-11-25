-- Contenido gramatical del Plan 11: cada punto del sílabo trae, además de
-- estructura, explicación y ejemplos, los marcadores que sus ejemplos
-- contienen, los errores típicos diagnosticados y los puntos relacionados.
-- El contenido llega desde server/db/seeds/grammar/*.json vía seed.sql.
alter table public.grammar_points
  add column if not exists markers text[] not null default '{}'::text[],
  add column if not exists common_errors jsonb not null default '[]'::jsonb,
  add column if not exists see_also jsonb not null default '[]'::jsonb;
