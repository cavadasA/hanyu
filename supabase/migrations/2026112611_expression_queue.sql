-- Plan 13, Tarea 6: la expresión entra en la cola.
--
-- Pronunciación es una habilidad de palabra: se sirve con build_review_queue_mode y se
-- registra con apply_review, como recall o listening. Solo hace falta que cada tarjeta
-- tenga su estado, suspendido hasta que el reconocimiento se asiente (unlock_derived_skills).
--
-- Escritura es de carácter (target_id = punto de código, ver 2026112601): necesita su
-- propia cola y su propio registro, porque apply_review parte de una tarjeta de palabra.

create or replace function public.initialize_word_skill_states()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.learner_skill_state (
    user_id, target_kind, target_id, skill, suspended, auto_suspended
  )
  values
    (new.user_id, 'word', new.word_id, 'recognition', false, false),
    (new.user_id, 'word', new.word_id, 'recall', true, true),
    (new.user_id, 'word', new.word_id, 'listening', true, true),
    (new.user_id, 'word', new.word_id, 'pronunciation', true, true)
  on conflict (user_id, target_kind, target_id, skill) do nothing;

  return new;
end;
$$;

-- Las tarjetas que ya existen: estado de pronunciación suspendido y automático, para que
-- el desbloqueo por reconocimiento lo libere igual que a las demás habilidades derivadas.
insert into public.learner_skill_state (
  user_id, target_kind, target_id, skill, suspended, auto_suspended
)
select sc.user_id, 'word', sc.word_id, 'pronunciation', true, true from public.srs_cards sc
on conflict (user_id, target_kind, target_id, skill) do nothing;

-- Enunciado del quiz de escritura: una palabra que contiene el carácter, para pedir
-- «□生 · xuésheng · estudiante» sin enseñarlo. Primero las que el alumno ya estudia;
-- después, la más básica del sílabo (nivel más bajo, más corta).
create or replace function public.writing_example(p_hanzi text)
returns table(hanzi text, pinyin text, meaning text)
language sql
stable
security definer
set search_path = public
as $$
  select w.hanzi, w.pinyin, coalesce(w.meaning_es, w.meaning_en)
  from public.words w
  where position(p_hanzi in w.hanzi) > 0
  order by
    exists (select 1 from public.srs_cards sc where sc.user_id = auth.uid() and sc.word_id = w.id) desc,
    w.hsk_level, char_length(w.hanzi), w.id
  limit 1;
$$;

revoke all on function public.writing_example(text) from public;

-- Cola de escritura: primero los caracteres vencidos; después, hasta p_new caracteres
-- nuevos de la lista de escritura (书写字) que aparecen en palabras cuyo reconocimiento ya
-- está asentado (el mismo umbral que desbloquea las habilidades derivadas).
drop function if exists public.build_writing_queue(integer, integer);
create or replace function public.build_writing_queue(
  p_limit integer default 10,
  p_new integer default 3
)
returns table(
  hanzi text,
  target_id bigint,
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
  version bigint,
  example_word text,
  example_pinyin text,
  example_meaning text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(0, coalesce(p_limit, 10));
  v_due integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into v_due
  from (
    select 1
    from public.learner_skill_state s
    join public.hsk_characters c on ascii(c.hanzi) = s.target_id and c.handwriting
    where s.user_id = v_user_id
      and s.target_kind = 'character'
      and s.skill = 'writing'
      and not s.suspended
      and s.fsrs_state <> 'new'
      and s.next_review_at <= now()
    limit v_limit
  ) due;

  return query
  select
    c.hanzi, s.target_id, false, s.difficulty, s.stability, s.reps, s.lapses,
    s.learning_steps, s.scheduled_days, s.elapsed_days, s.fsrs_state,
    s.next_review_at, s.last_reviewed_at, s.version,
    example.hanzi, example.pinyin, example.meaning
  from public.learner_skill_state s
  join public.hsk_characters c on ascii(c.hanzi) = s.target_id and c.handwriting
  left join lateral public.writing_example(c.hanzi) example on true
  where s.user_id = v_user_id
    and s.target_kind = 'character'
    and s.skill = 'writing'
    and not s.suspended
    and s.fsrs_state <> 'new'
    and s.next_review_at <= now()
  order by s.next_review_at
  limit v_limit;

  return query
  with known as (
    select distinct piece.ch
    from public.learner_skill_state base
    join public.words w on w.id = base.target_id
    cross join lateral regexp_split_to_table(w.hanzi, '') as piece(ch)
    where base.user_id = v_user_id
      and base.target_kind = 'word'
      and base.skill = 'recognition' and coalesce(base.stability, 0) >= 7
  )
  select
    c.hanzi, ascii(c.hanzi)::bigint, true, null::numeric, null::numeric, 0, 0, 0, 0, 0,
    'new'::text, null::timestamptz, null::timestamptz,
    coalesce((
      select s.version from public.learner_skill_state s
      where s.user_id = v_user_id and s.target_kind = 'character'
        and s.target_id = ascii(c.hanzi) and s.skill = 'writing'
    ), 0)::bigint,
    example.hanzi, example.pinyin, example.meaning
  from public.hsk_characters c
  join known k on k.ch = c.hanzi
  left join lateral public.writing_example(c.hanzi) example on true
  where c.handwriting
    and not exists (
      select 1 from public.learner_skill_state s
      where s.user_id = v_user_id and s.target_kind = 'character'
        and s.target_id = ascii(c.hanzi) and s.skill = 'writing'
        and (s.fsrs_state <> 'new' or s.suspended)
    )
  order by c.hsk_level, c.hanzi
  limit greatest(0, least(coalesce(p_new, 3), v_limit - v_due));

end;
$$;

revoke all on function public.build_writing_queue(integer, integer) from public;
grant execute on function public.build_writing_queue(integer, integer) to authenticated;

-- Registro de un repaso de escritura. Como apply_review: el cliente calcula el estado
-- FSRS y el servidor lo guarda con control de versión e idempotencia (client_review_id),
-- y deja un evento review_rated del carácter. Solo escritura de caracteres: las
-- habilidades de palabra, pronunciación incluida, siguen con apply_review.
create or replace function public.apply_skill_review(
  p_target_kind public.learning_target_kind,
  p_target_id bigint,
  p_skill public.learning_skill,
  p_review_id uuid,
  p_reviewed_at timestamptz,
  p_expected_version bigint,
  p_grade smallint,
  p_state jsonb,
  p_prior jsonb,
  p_payload jsonb default '{}'::jsonb
)
returns table(outcome text, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_state public.learner_skill_state;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_target_kind <> 'character' or p_skill <> 'writing' then
    raise exception 'apply_skill_review: solo escritura de caracteres; las palabras usan apply_review';
  end if;
  if p_target_id is null or p_review_id is null or p_reviewed_at is null then
    raise exception 'target, review identity and timestamp are required';
  end if;
  if p_expected_version is null then
    raise exception 'expected_version must not be null';
  end if;
  if p_grade is null or p_grade < 1 or p_grade > 4 then
    raise exception 'grade must be between 1 and 4';
  end if;
  if p_state is null or p_state->>'due' is null or p_state->>'state' is null then
    raise exception 'state must contain due and state';
  end if;
  if p_prior is null then
    raise exception 'prior state must not be null';
  end if;

  select * into v_state
  from public.learner_skill_state s
  where s.user_id = v_user_id
    and s.target_kind = p_target_kind
    and s.target_id = p_target_id
    and s.skill = p_skill
  for update;

  if not found then
    -- guard_expression_skill_state rechaza un carácter que no es de escritura.
    insert into public.learner_skill_state (user_id, target_kind, target_id, skill)
    values (v_user_id, p_target_kind, p_target_id, p_skill)
    on conflict (user_id, target_kind, target_id, skill) do nothing;

    select * into v_state
    from public.learner_skill_state s
    where s.user_id = v_user_id
      and s.target_kind = p_target_kind
      and s.target_id = p_target_id
      and s.skill = p_skill
    for update;
  end if;

  if exists (
    select 1 from public.learning_event
    where user_id = v_user_id and client_event_id = p_review_id
  ) then
    outcome := 'duplicate';
    version := v_state.version;
    return next;
    return;
  end if;

  if v_state.version <> p_expected_version then
    outcome := 'conflict';
    version := v_state.version;
    return next;
    return;
  end if;

  v_new_version := v_state.version + 1;

  update public.learner_skill_state set
    difficulty       = (p_state->>'difficulty')::numeric,
    stability        = (p_state->>'stability')::numeric,
    reps             = (p_state->>'reps')::integer,
    lapses           = (p_state->>'lapses')::integer,
    learning_steps   = (p_state->>'learning_steps')::integer,
    scheduled_days   = (p_state->>'scheduled_days')::integer,
    elapsed_days     = (p_state->>'elapsed_days')::integer,
    fsrs_state       = p_state->>'state',
    next_review_at   = (p_state->>'due')::timestamptz,
    last_reviewed_at = p_reviewed_at,
    leech            = greatest(
      coalesce((p_state->>'lapses')::integer, 0)
        - coalesce(v_state.leech_cleared_lapses, 0),
      0
    ) >= public.leech_lapses_threshold(),
    version          = v_new_version,
    updated_at       = now()
  where id = v_state.id;

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload, client_event_id, occurred_at)
  values (
    v_user_id,
    'review_rated', 'character', p_target_id, p_skill,
    jsonb_build_object(
      'grade', p_grade,
      'phase_before', p_prior->>'state',
      'prior', p_prior,
      'state', p_state
    ) || coalesce(p_payload, '{}'::jsonb),
    p_review_id,
    p_reviewed_at
  );

  outcome := 'applied';
  version := v_new_version;
  return next;
end;
$$;

revoke all on function public.apply_skill_review(
  public.learning_target_kind, bigint, public.learning_skill, uuid, timestamptz, bigint, smallint, jsonb, jsonb, jsonb
) from public;
grant execute on function public.apply_skill_review(
  public.learning_target_kind, bigint, public.learning_skill, uuid, timestamptz, bigint, smallint, jsonb, jsonb, jsonb
) to authenticated;
