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
      sc.id as card_id, s.target_id as word_id, s.skill, false as is_new,
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
      sc.id as card_id, w.id as word_id, p_skill as skill, true as is_new,
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
