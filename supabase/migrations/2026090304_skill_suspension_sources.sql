-- Distingue una suspensión automática de una suspensión elegida por el usuario.
-- El desbloqueo por reconocimiento solo puede retirar la primera.
alter table public.learner_skill_state
  add column if not exists auto_suspended boolean not null default false;

-- Los estados derivados creados por las migraciones anteriores eran siempre
-- automáticos; conservarlos como tales permite desbloquearlos una vez.
update public.learner_skill_state
set auto_suspended = true
where skill <> 'recognition'
  and suspended
  and not auto_suspended;

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
    (new.user_id, 'word', new.word_id, 'listening', true, true)
  on conflict (user_id, target_kind, target_id, skill) do nothing;

  return new;
end;
$$;

create or replace function public.initialize_reading_skill_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.srs_cards
    where user_id = new.user_id and word_id = new.word_id
  ) then
    insert into public.learner_skill_state (
      user_id, target_kind, target_id, skill, suspended, auto_suspended
    )
    values (new.user_id, 'word', new.word_id, 'reading', true, true)
    on conflict (user_id, target_kind, target_id, skill) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.unlock_derived_skills(p_min_stability numeric default 7)
returns integer
language sql
security definer
set search_path = public
as $$
  with unlocked as (
    update public.learner_skill_state s
    set suspended = false, auto_suspended = false, updated_at = now()
    where s.user_id = auth.uid()
      and s.skill <> 'recognition'
      and s.suspended
      and s.auto_suspended
      and exists (
        select 1 from public.learner_skill_state base
        where base.user_id = s.user_id
          and base.target_kind = s.target_kind
          and base.target_id = s.target_id
          and base.skill = 'recognition'
          and coalesce(base.stability, 0) >= p_min_stability
      )
    returning 1
  )
  select count(*)::integer from unlocked;
$$;

grant execute on function public.unlock_derived_skills(numeric) to authenticated;
