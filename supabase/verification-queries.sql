-- Run these queries in Supabase SQL Editor after applying migrations.

-- 1) Verify public tables
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'user_settings',
    'words',
    'grammar_points',
    'srs_cards',
    'learner_skill_state',
    'learning_event',
    'review_log',
    'user_stats',
    'generated_exercises',
    'exercise_attempts',
    'reading',
    'content_item',
    'content_teaches',
    'reading_attempts'
  )
order by table_name;

-- 2) Verify RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'user_settings',
    'words',
    'grammar_points',
    'srs_cards',
    'learner_skill_state',
    'learning_event',
    'review_log',
    'user_stats',
    'generated_exercises',
    'exercise_attempts',
    'reading',
    'content_item',
    'content_teaches',
    'reading_attempts'
  )
order by tablename;

-- 3) Verify policies
select tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4) Verify triggers and functions
select proname
from pg_proc
where proname in (
  'set_updated_at',
  'handle_new_user',
  'ensure_today_stats',
  'apply_review',
  'log_study_time',
  'get_dashboard'
)
order by proname;

-- 5) Verify auth trigger is attached
select trigger_name, event_object_table, event_manipulation
from information_schema.triggers
where trigger_schema = 'auth'
  and event_object_table = 'users'
order by trigger_name;

-- 6) Verify seed counts after running supabase/seed.sql
select hsk_level, count(*) as words
from public.words
group by hsk_level
order by hsk_level;

select count(*) as grammar_points
from public.grammar_points;

select count(*) as generated_exercises
from public.generated_exercises;
