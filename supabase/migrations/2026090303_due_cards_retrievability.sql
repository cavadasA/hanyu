-- Keep the FSRS evidence column available to clients loading due cards.
-- The scheduling state remains calculated by the domain package; this RPC only
-- exposes the value persisted by apply_review.

drop function if exists public.get_due_cards(integer, uuid, public.learning_skill);

create or replace function public.get_due_cards(
  p_limit integer default 50,
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition'
)
returns table(
  card_id uuid,
  user_id uuid,
  word_id bigint,
  skill public.learning_skill,
  difficulty numeric,
  stability numeric,
  retrievability numeric,
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
language sql
security definer
set search_path = public
as $$
  select
    sc.id,
    sc.user_id,
    sc.word_id,
    s.skill,
    s.difficulty,
    s.stability,
    s.retrievability,
    s.reps,
    s.lapses,
    s.learning_steps,
    s.scheduled_days,
    s.elapsed_days,
    s.fsrs_state,
    s.next_review_at,
    s.last_reviewed_at,
    s.version
  from public.learner_skill_state s
  join public.srs_cards sc
    on sc.user_id = s.user_id and sc.word_id = s.target_id
  where s.user_id = auth.uid()
    and s.target_kind = 'word'
    and s.skill = p_skill
    and not s.suspended
    and (s.next_review_at is null or s.next_review_at <= now())
    and exists (
      select 1
      from public.deck_cards dc
      join public.decks d on d.id = dc.deck_id
      where dc.word_id = sc.word_id
        and d.user_id = auth.uid()
        and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
    )
  order by s.next_review_at asc nulls first
  limit greatest(1, coalesce(p_limit, 50));
$$;

grant execute on function public.get_due_cards(integer, uuid, public.learning_skill) to authenticated;
