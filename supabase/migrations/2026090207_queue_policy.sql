-- "Cuántas tarjetas" son cuatro decisiones distintas y hasta ahora había dos
-- columnas, ninguna de las cuales limitaba la cola: cards_per_day solo pintaba
-- una meta en Today, y max_reviews_per_session recortaba el lote ya pedido.

alter table public.user_settings
  add column if not exists new_cards_per_day integer not null default 10
    check (new_cards_per_day between 0 and 100),
  add column if not exists review_limit_per_day integer not null default 200
    check (review_limit_per_day between 10 and 999),
  add column if not exists session_size integer not null default 20
    check (session_size between 5 and 200);

-- Lo que el usuario ya había configurado se traslada al nombre que describe lo
-- que de verdad hace, en vez de perderse.
update public.user_settings
set new_cards_per_day = least(100, greatest(0, coalesce(cards_per_day, 10))),
    session_size = least(200, greatest(5, coalesce(max_reviews_per_session, 20)));

alter table public.user_settings
  drop column if exists cards_per_day,
  drop column if exists max_reviews_per_session;

-- La política de cola vive aquí y en ningún otro sitio. El cliente ordena lo
-- que esta función selecciona, pero no decide qué entra ni cuánto: esas son
-- reglas sobre el conjunto completo y solo se pueden aplicar donde está.
create or replace function public.build_review_queue(
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
  v_reviewed integer;
  v_new_allowance integer;
  v_review_allowance integer;
  v_session integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_settings from public.user_settings where user_id = v_user_id;
  if not found then
    raise exception 'Settings not found';
  end if;

  v_session := least(
    greatest(1, coalesce(p_limit, v_settings.session_size)),
    v_settings.session_size
  );

  -- Lo ya hecho hoy cuenta aunque fuese en otra sesión: los dos cupos son
  -- diarios, no por sesión. Aplicar el techo de repasos por sesión permitiría
  -- saltárselo abriendo la app dos veces, que es lo mismo que no tenerlo.
  select coalesce(cards_new, 0), coalesce(cards_reviewed, 0)
  into v_introduced, v_reviewed
  from public.user_stats
  where user_id = v_user_id and date = v_today;

  v_new_allowance := greatest(0, v_settings.new_cards_per_day - coalesce(v_introduced, 0));
  v_review_allowance := greatest(0, v_settings.review_limit_per_day - coalesce(v_reviewed, 0));

  return query
  with scope as (
    select distinct dc.word_id
    from public.deck_cards dc
    join public.decks d on d.id = dc.deck_id
    where d.user_id = v_user_id
      and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
  ),
  due_reviews as (
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
      and s.next_review_at is not null
      and s.next_review_at <= now()
      and s.target_id in (select word_id from scope)
    order by s.next_review_at asc
    limit least(v_session, v_review_allowance)
  ),
  new_cards as (
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
    -- El currículo manda sobre el identificador: primero el nivel objetivo,
    -- y dentro de él lo más frecuente. Ordenar por nivel ascendente es lo que
    -- llenaba el mazo "HSK 2" con 150 palabras de HSK 1.
    order by
      case when w.hsk_level = v_settings.current_level then 0 else 1 end,
      w.hsk_level,
      coalesce(w.frequency, 2147483647),
      w.id
    limit v_new_allowance
  )
  select * from due_reviews
  union all
  select * from (select * from new_cards limit greatest(0, v_session - (select count(*) from due_reviews))) n;
end;
$$;

revoke all on function public.build_review_queue(uuid, public.learning_skill, integer) from public;
grant execute on function public.build_review_queue(uuid, public.learning_skill, integer) to authenticated;

-- El mazo era una foto de 150 palabras elegidas ordenando por nivel, lo que
-- llenaba de HSK 1 un mazo llamado "HSK 2". Ahora el mazo es el alcance
-- completo del objetivo y las tarjetas se crean a medida que el cupo diario
-- las introduce: la promesa del nombre y el contenido vuelven a coincidir.
create or replace function public.create_study_plan(p_levels int[] default array[1, 2])
returns table(deck_id uuid, scope_size integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deck_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select id into v_deck_id
  from public.decks
  where user_id = v_user_id and is_default;

  if v_deck_id is null then
    insert into public.decks (user_id, name, description, is_default)
    values (
      v_user_id,
      'HSK ' || array_to_string(p_levels, ' + '),
      'Todo el vocabulario del objetivo. Las tarjetas se introducen día a día.',
      true
    )
    returning id into v_deck_id;
  end if;

  insert into public.deck_cards (deck_id, word_id)
  select v_deck_id, w.id
  from public.words w
  where w.hsk_level = any(p_levels)
  on conflict (deck_id, word_id) do nothing;

  -- srs_cards es la identidad de la tarjeta y puede existir para todo el
  -- alcance: es barato y no programa nada. Lo que NO se crea por adelantado es
  -- learner_skill_state, porque una fila ahí es una tarjeta que el planificador
  -- considera vencida.
  insert into public.srs_cards (user_id, word_id)
  select v_user_id, dc.word_id
  from public.deck_cards dc
  where dc.deck_id = v_deck_id
  on conflict (user_id, word_id) do nothing;

  deck_id := v_deck_id;
  select count(*)::integer into scope_size
  from public.deck_cards
  where deck_cards.deck_id = v_deck_id;
  return next;
end;
$$;

-- Lo que el usuario demuestra reconocer no vuelve a la cola de nuevas. No se
-- marca como aprendido —reconocerlo una vez no lo prueba— sino como suspendido
-- con su motivo, para que pueda revivirlo desde Ajustes si se arrepiente.
create or replace function public.submit_diagnostic(p_results jsonb)
returns table(suspended integer, queued integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.learner_skill_state (
    user_id, target_kind, target_id, skill, suspended, fsrs_state
  )
  select
    v_user_id, 'word', (entry->>'word_id')::bigint, 'recognition',
    (entry->>'known')::boolean, 'new'
  from jsonb_array_elements(p_results) as entry
  where (entry->>'known')::boolean
  on conflict (user_id, target_kind, target_id, skill)
  do update set suspended = true, updated_at = now();

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload)
  select
    v_user_id, 'review_rated', 'word', (entry->>'word_id')::bigint, 'recognition',
    jsonb_build_object('source', 'diagnostic', 'known', entry->>'known')
  from jsonb_array_elements(p_results) as entry;

  select count(*)::integer into suspended
  from jsonb_array_elements(p_results) as entry
  where (entry->>'known')::boolean;

  select jsonb_array_length(p_results) - suspended into queued;
  return next;
end;
$$;

drop function if exists public.create_starter_deck(text, integer);

revoke all on function public.create_study_plan(int[]) from public;
grant execute on function public.create_study_plan(int[]) to authenticated;
revoke all on function public.submit_diagnostic(jsonb) from public;
grant execute on function public.submit_diagnostic(jsonb) to authenticated;
