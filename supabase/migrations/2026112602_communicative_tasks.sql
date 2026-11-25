--
-- Plan 13: tareas comunicativas. El enunciado vive aquí y no en el cliente:
-- la Edge Function grade-communicative lo lee por slug y nunca se fía de la
-- situación ni de las intenciones que mande la app. El contenido lo siembra
-- build-supabase-seed desde server/db/seeds/communicative/*.json, después de
-- pasar validateCommunicativeTask.

create table if not exists public.communicative_task (
  slug text primary key,
  hsk_level integer not null check (hsk_level between 1 and 3),
  situation_es text not null,
  mode text not null check (mode in ('write', 'speak')),
  intent text[] not null check (cardinality(intent) > 0),
  required_markers jsonb not null,
  min_chars integer not null check (min_chars > 0),
  max_chars integer not null check (max_chars >= min_chars),
  model_answer jsonb not null
);

create index if not exists idx_communicative_task_level on public.communicative_task(hsk_level);

alter table public.communicative_task enable row level security;

drop policy if exists communicative_task_select_authenticated on public.communicative_task;
create policy communicative_task_select_authenticated on public.communicative_task
for select to authenticated using (true);

grant select on public.communicative_task to authenticated;
grant select, insert, update, delete on public.communicative_task to service_role;
