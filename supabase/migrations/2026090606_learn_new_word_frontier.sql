-- Learn deja de quedarse sin palabras nuevas mientras la unidad activa madura.
--
-- `active_unit()` marca una unidad como completada solo cuando todas sus
-- palabras alcanzan la estabilidad de `unit_completion_stability_days()` —21
-- días—, y el modo learn sacaba palabras nuevas exclusivamente de esa unidad.
-- En cuanto se introducen todas sus palabras, la unidad sigue siendo la activa
-- durante semanas y learn devuelve cero palabras nuevas: el temario queda
-- bloqueado sin que nada falle.
--
-- Son dos cosas distintas que estaban colapsadas en una: la unidad que se está
-- *consolidando* (la que gobierna gramática, lectura y progreso) y la frontera
-- por la que se *introduce* vocabulario nuevo. Aquí se separan. `study_units()`
-- publica la lista ordenada de unidades elegibles —la misma que `active_unit()`
-- resumía a una sola—, `active_unit()` pasa a ser su primera fila, y learn
-- recorre esa lista en orden: si la unidad de cabeza ya no tiene palabras
-- nuevas para la habilidad pedida, la siguiente las aporta.
--
-- Lo que no cambia: los prerrequisitos de gramática siguen excluyendo unidades,
-- el nivel del usuario sigue siendo el techo, y `new_cards_per_day` sigue
-- siendo el tope diario. Avanzar la frontera no reparte más tarjetas, solo
-- evita que no haya ninguna que repartir.

create or replace function public.study_units(
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
  settled_items integer,
  order_idx integer
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
    i.word_count, i.pattern_count, i.grammar_id, i.total_items, i.settled_items,
    i.order_idx
  from incomplete i
  where not exists (
    select 1
    from public.grammar_prerequisite gp
    join incomplete req
      on req.hsk_level = gp.requires_level and req.code = gp.requires_code
    where gp.hsk_level = i.hsk_level and gp.code = i.code
  )
  order by case when i.total_words > 0 then 0 else 1 end,
    i.hsk_level, i.order_idx;
$$;

revoke all on function public.study_units(numeric) from public;
grant execute on function public.study_units(numeric) to authenticated;

-- La unidad activa es, exactamente igual que antes, la primera de esa lista.
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
  select su.hsk_level, su.code, su.title, su.total_words, su.settled_words,
    su.word_count, su.pattern_count, su.grammar_id, su.total_items, su.settled_items
  from public.study_units(p_stability_days) su
  order by case when su.total_words > 0 then 0 else 1 end,
    su.hsk_level, su.order_idx
  limit 1;
$$;

revoke all on function public.active_unit(numeric) from public;
grant execute on function public.active_unit(numeric) to authenticated;

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
#variable_conflict use_column
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
      and s.target_id in (select scope.word_id from scope)
    order by random()
    limit greatest(1, coalesce(p_limit, 20));
    return;
  end if;

  if p_mode = 'learn' then
    select * into v_settings
    from public.user_settings us
    where us.user_id = v_user_id;

    if not found then
      raise exception 'Settings not found';
    end if;

    v_session := least(
      greatest(1, coalesce(p_limit, v_settings.session_size)),
      v_settings.session_size
    );

    select coalesce(ust.cards_new, 0)
    into v_introduced
    from public.user_stats ust
    where ust.user_id = v_user_id and ust.date = v_today;

    v_new_allowance := greatest(0, v_settings.new_cards_per_day - coalesce(v_introduced, 0));

    return query
    -- La frontera son las unidades elegibles en orden de temario. Se recorre
    -- entera, no solo la primera: una unidad sin palabras nuevas para esta
    -- habilidad simplemente no aporta ninguna, y la siguiente toma el relevo.
    with frontier as (
      select
        su.hsk_level,
        su.code,
        row_number() over (
          order by case when su.total_words > 0 then 0 else 1 end,
            su.hsk_level, su.order_idx
        ) as unit_rank
      from public.study_units() su
    ),
    scope as (
      -- Una palabra puede pertenecer a varias unidades. Se queda con la más
      -- temprana para que aparezca una sola vez y en su sitio.
      select uw.word_id, min(f.unit_rank) as unit_rank
      from public.unit_word uw
      join frontier f on f.hsk_level = uw.hsk_level and f.code = uw.code
      join public.deck_cards dc on dc.word_id = uw.word_id
      join public.decks d on d.id = dc.deck_id
      where d.user_id = v_user_id
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
      group by uw.word_id
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
      scope.unit_rank,
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
