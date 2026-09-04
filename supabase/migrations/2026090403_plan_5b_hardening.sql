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
create or replace function public.unit_completion_stability_days()
returns numeric
language sql
immutable
as $$
  select 21::numeric;
$$;

alter type public.learning_event_kind add value if not exists 'grammar_studied';

create or replace function public.mark_grammar_studied(p_grammar_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion_stability_days integer := public.unit_completion_stability_days()::integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.grammar_points where id = p_grammar_id) then
    raise exception 'Grammar point not found';
  end if;

  insert into public.learner_skill_state (
    user_id, target_kind, target_id, skill, difficulty, stability, reps,
    learning_steps, scheduled_days, elapsed_days, fsrs_state, suspended
  ) values (
    auth.uid(), 'grammar', p_grammar_id, 'recognition', null,
    v_completion_stability_days, 1, 0, v_completion_stability_days, 0,
    'review', false
  )
  on conflict (user_id, target_kind, target_id, skill) do update
    set stability = greatest(
          coalesce(learner_skill_state.stability, 0),
          v_completion_stability_days
        ),
        fsrs_state = 'review',
        suspended = false,
        updated_at = now();

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload)
  values (
    auth.uid(), 'grammar_studied', 'grammar', p_grammar_id, 'recognition', '{}'::jsonb
  );
end;
$$;

revoke all on function public.mark_grammar_studied(bigint) from public;
grant execute on function public.mark_grammar_studied(bigint) to authenticated;

drop function if exists public.active_unit(numeric);

create or replace function public.active_unit(
  p_stability_days numeric default public.unit_completion_stability_days()
)
returns table(
  hsk_level integer,
  code text,
  title text,
  total_words integer,
  settled_words integer,
  word_count integer,
  pattern_count integer,
  grammar_id bigint,
  total_items integer,
  settled_items integer
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
      gp.id as grammar_id,
      count(uw.word_id)::integer as total_words,
      count(uw.word_id)::integer as word_count,
      count(*) filter (
        where uw.word_id is not null
          and (coalesce(s.stability, 0) >= p_stability_days or coalesce(s.suspended, false))
      )::integer as settled_words,
      cardinality(u.patterns)::integer as pattern_count,
      (
        count(uw.word_id)::integer + case when cardinality(u.patterns) > 0 then 1 else 0 end
      )::integer as total_items,
      (
        count(*) filter (
          where uw.word_id is not null
            and (coalesce(s.stability, 0) >= p_stability_days or coalesce(s.suspended, false))
        )::integer
        + case when cardinality(u.patterns) > 0 and exists (
            select 1
            from public.learner_skill_state gs
            where gs.user_id = auth.uid()
              and gs.target_kind = 'grammar'
              and gs.target_id = gp.id
              and gs.skill = 'recognition'
              and (coalesce(gs.stability, 0) >= p_stability_days or coalesce(gs.suspended, false))
          ) then 1 else 0 end
      )::integer as settled_items
    from public.unit u
    left join public.unit_word uw on uw.hsk_level = u.hsk_level and uw.code = u.code
    left join public.grammar_points gp on gp.hsk_level = u.hsk_level and gp.code = u.code
    left join public.learner_skill_state s
      on s.user_id = auth.uid()
     and s.target_kind = 'word'
     and s.target_id = uw.word_id
     and s.skill = 'recognition'
    where u.hsk_level <= (
      select current_level from public.user_settings where user_id = auth.uid()
    )
    group by u.hsk_level, u.code, u.title, u.order_idx, gp.id, u.patterns
  ),
  incomplete as (
    select * from progress
    where total_items > 0 and settled_items < total_items
  )
  select i.hsk_level, i.code, i.title, i.total_words, i.settled_words,
    i.word_count, i.pattern_count, i.grammar_id, i.total_items, i.settled_items
  from incomplete i
  -- Una unidad no se propone si algún prerrequisito suyo sigue incompleto.
  where not exists (
    select 1
    from public.grammar_prerequisite gp
    join incomplete req
      on req.hsk_level = gp.requires_level and req.code = gp.requires_code
    where gp.hsk_level = i.hsk_level and gp.code = i.code
  )
  -- Las palabras pueden avanzar en paralelo: las unidades de gramática
  -- siguen dentro del grafo y sus prerrequisitos continúan bloqueando lo
  -- que corresponda, pero no dejan a un usuario nuevo sin tarjetas.
  order by case when i.total_words > 0 then 0 else 1 end,
    i.hsk_level, i.order_idx
  limit 1;
$$;

revoke all on function public.active_unit(numeric) from public;
grant execute on function public.active_unit(numeric) to authenticated;

-- La fecha es una señal de planificación, no una orden de reprogramación:
-- sirve para explicar el ritmo diario y poder cambiar de objetivo sin perder
-- el historial de las tarjetas.
alter table public.user_settings
  add column if not exists exam_date date;

-- Today needs the uncapped split, not the session-sized queue. Relearning is
-- part of the due set, but it is displayed as its own step.
create or replace function public.count_due_cards_by_state(
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition'
)
returns table(regular_due_count bigint, relearning_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(distinct dc.word_id) filter (where s.fsrs_state <> 'relearning') as regular_due_count,
    count(distinct dc.word_id) filter (where s.fsrs_state = 'relearning') as relearning_count
  from public.deck_cards dc
  join public.decks d on d.id = dc.deck_id and d.user_id = auth.uid()
  join public.learner_skill_state s
    on s.user_id = d.user_id
   and s.target_kind = 'word'
   and s.target_id = dc.word_id
   and s.skill = p_skill
  where ((p_deck_id is null and d.is_active) or dc.deck_id = p_deck_id)
    and not s.suspended
    and s.fsrs_state <> 'new'
    and s.next_review_at is not null
    and s.next_review_at <= now();
$$;

revoke all on function public.count_due_cards_by_state(uuid, public.learning_skill) from public;
grant execute on function public.count_due_cards_by_state(uuid, public.learning_skill) to authenticated;

-- El archivo 0208 pudo haberse aplicado ya en una base existente. Retiramos
-- su sobrecarga antes de publicar la función con nombre explícito.
drop function if exists public.build_review_queue(uuid, public.learning_skill, integer, text);

-- La habilidad describe el ejercicio; el modo describe qué subconjunto se
-- estudia y qué efectos persistentes tiene. Se conserva la RPC de tres
-- argumentos para clientes antiguos y se añade una RPC con nombre distinto:
-- PostgreSQL no puede resolver de forma segura dos firmas con defaults.
create or replace function public.build_review_queue_mode(
  p_mode text,
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition',
  p_limit integer default null
)
returns table(
  card_id uuid,
  user_id uuid,
  word_id bigint,
  skill public.learning_skill,
  is_new boolean,
  difficulty numeric,
  stability numeric,
  reps integer,
  lapses integer,
  learning_steps integer,
  scheduled_days integer,
  elapsed_days integer,
  fsrs_state text,
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  version bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.user_settings;
  v_today date := (now() at time zone 'utc')::date;
  v_introduced integer;
  v_new_allowance integer;
  v_session integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_mode not in ('learn', 'review', 'exam') then
    raise exception 'Unknown study mode: %', p_mode;
  end if;

  if p_mode = 'exam' then
    return query
    with scope as (
      select distinct dc.word_id
      from public.deck_cards dc
      join public.decks d on d.id = dc.deck_id
      where d.user_id = v_user_id
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
    )
    select
      sc.id as card_id, sc.user_id, s.target_id as word_id, s.skill, false as is_new,
      s.difficulty, s.stability, s.reps, s.lapses, s.learning_steps,
      s.scheduled_days, s.elapsed_days, s.fsrs_state,
      s.next_review_at, s.last_reviewed_at, s.version
    from public.learner_skill_state s
    join public.srs_cards sc on sc.user_id = s.user_id and sc.word_id = s.target_id
    where s.user_id = v_user_id
      and s.target_kind = 'word'
      and s.skill = p_skill
      and not s.suspended
      and s.fsrs_state <> 'new'
      and s.target_id in (select word_id from scope)
    order by random()
    limit greatest(1, coalesce(p_limit, 20));
    return;
  end if;

  if p_mode = 'learn' then
    select * into v_settings
    from public.user_settings
    where user_id = v_user_id;
    if not found then
      raise exception 'Settings not found';
    end if;

    v_session := least(
      greatest(1, coalesce(p_limit, v_settings.session_size)),
      v_settings.session_size
    );

    select coalesce(cards_new, 0)
    into v_introduced
    from public.user_stats
    where user_id = v_user_id and date = v_today;

    v_new_allowance := greatest(0, v_settings.new_cards_per_day - coalesce(v_introduced, 0));

    return query
    with active as (
      select hsk_level, code
      from public.active_unit()
    ),
    scope as (
      select distinct uw.word_id
      from public.unit_word uw
      join active a on a.hsk_level = uw.hsk_level and a.code = uw.code
      join public.deck_cards dc on dc.word_id = uw.word_id
      join public.decks d on d.id = dc.deck_id
      where d.user_id = v_user_id
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
    )
    select
      sc.id as card_id, sc.user_id, w.id as word_id, p_skill as skill, true as is_new,
      s.difficulty, s.stability, s.reps, s.lapses, s.learning_steps,
      s.scheduled_days, s.elapsed_days, coalesce(s.fsrs_state, 'new') as fsrs_state,
      s.next_review_at, s.last_reviewed_at, coalesce(s.version, 0) as version
    from public.words w
    join scope on scope.word_id = w.id
    join public.srs_cards sc on sc.user_id = v_user_id and sc.word_id = w.id
    left join public.learner_skill_state s
      on s.user_id = v_user_id and s.target_kind = 'word'
     and s.target_id = w.id and s.skill = p_skill
    where coalesce(s.fsrs_state, 'new') = 'new'
      and coalesce(s.suspended, false) = false
    order by
      case when w.hsk_level = v_settings.current_level then 0 else 1 end,
      w.hsk_level,
      coalesce(w.frequency, 2147483647),
      w.id
    limit least(v_new_allowance, v_session);
    return;
  end if;

  return query
  select q.*
  from public.build_review_queue(p_deck_id, p_skill, p_limit) q
  where not q.is_new;
end;
$$;

revoke all on function public.build_review_queue_mode(text, uuid, public.learning_skill, integer) from public;
grant execute on function public.build_review_queue_mode(text, uuid, public.learning_skill, integer) to authenticated;
