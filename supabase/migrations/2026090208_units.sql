-- Plan 5B: curriculum units derived from grammar points.
--
-- Una unidad es un punto del sílabo más las palabras que enumera. No se
-- escribe a mano: se deriva, así que regenerar el sílabo regenera las unidades.

create table if not exists public.unit (
  code text not null,
  hsk_level integer not null check (hsk_level between 1 and 3),
  title text not null,
  "group" text,
  category text,
  patterns text[] not null default '{}',
  order_idx integer not null,
  primary key (hsk_level, code)
);

create table if not exists public.unit_word (
  hsk_level integer not null,
  code text not null,
  word_id bigint not null references public.words(id) on delete cascade,
  primary key (hsk_level, code, word_id),
  foreign key (hsk_level, code) references public.unit(hsk_level, code) on delete cascade
);

create index if not exists idx_unit_word_word on public.unit_word(word_id);

alter table public.unit enable row level security;
alter table public.unit_word enable row level security;

drop policy if exists unit_select_authenticated on public.unit;
create policy unit_select_authenticated on public.unit
for select using (auth.role() = 'authenticated');

drop policy if exists unit_word_select_authenticated on public.unit_word;
create policy unit_word_select_authenticated on public.unit_word
for select using (auth.role() = 'authenticated');

-- Umbral de estabilidad, en días, para dar una palabra por asentada dentro de
-- una unidad. Veintiuno es el punto en que el intervalo deja de medirse en días
-- sueltos; por debajo, llamar "completada" a la unidad sería optimismo.
create or replace function public.active_unit(p_stability_days numeric default 21)
returns table(
  hsk_level integer,
  code text,
  title text,
  total_words integer,
  settled_words integer
)
language sql
security definer
set search_path = public
as $$
  with progress as (
    select
      u.hsk_level,
      u.code,
      u.title,
      u.order_idx,
      count(uw.word_id)::integer as total_words,
      count(*) filter (
        where coalesce(s.stability, 0) >= p_stability_days or coalesce(s.suspended, false)
      )::integer as settled_words
    from public.unit u
    left join public.unit_word uw on uw.hsk_level = u.hsk_level and uw.code = u.code
    left join public.learner_skill_state s
      on s.user_id = auth.uid()
     and s.target_kind = 'word'
     and s.target_id = uw.word_id
     and s.skill = 'recognition'
    where u.hsk_level <= (
      select current_level from public.user_settings where user_id = auth.uid()
    )
    group by u.hsk_level, u.code, u.title, u.order_idx
  ),
  incomplete as (
    select * from progress
    where total_words > 0 and settled_words < total_words
  )
  select i.hsk_level, i.code, i.title, i.total_words, i.settled_words
  from incomplete i
  -- Una unidad no se propone si algún prerrequisito suyo sigue incompleto.
  where not exists (
    select 1
    from public.grammar_prerequisite gp
    join incomplete req
      on req.hsk_level = gp.requires_level and req.code = gp.requires_code
    where gp.hsk_level = i.hsk_level and gp.code = i.code
  )
  order by i.hsk_level, i.order_idx
  limit 1;
$$;

revoke all on function public.active_unit(numeric) from public;
grant execute on function public.active_unit(numeric) to authenticated;
