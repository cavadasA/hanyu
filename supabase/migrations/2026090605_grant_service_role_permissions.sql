-- Concede permisos globales a service_role y authenticated sobre el esquema public.
-- En Supabase, service_role es el rol usado por las Edge Functions (tokenize-reading,
-- generate-exercise) y tareas de backend. Si no tiene permisos explícitos sobre las
-- tablas, PostgreSQL devuelve 42501 (permission denied for table ...).

grant usage on schema public to anon, authenticated, service_role;

-- 1. Permisos para service_role (bypasea RLS en PostgREST y Edge Functions)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;

-- 2. Permisos para authenticated (gobernado por RLS)
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all routines in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on routines to authenticated;

-- 3. Permisos de lectura para anon en tablas de catálogo público
grant select on public.words, public.grammar_points, public.reading, public.hsk_characters,
  public.unit, public.unit_word, public.deck_templates, public.deck_template_words,
  public.exam_structure, public.content_item, public.content_teaches
to anon;
