-- grammar_points was missing the "pattern" column that the client already
-- selects for (packages/data/src/repositories/grammar.ts), causing
-- "column grammar_points.pattern does not exist" errors.

alter table public.grammar_points
  add column if not exists pattern text;

-- Backfill patterns for the seeded rows so existing environments don't end
-- up with null patterns after this migration runs.
update public.grammar_points
set pattern = case title
  when 'Basic word order (SVO)' then 'Subject + Verb + Object'
  when 'Questions with 吗 (ma)' then 'Statement + 吗?'
  when 'Negation with 不 (bù)' then '不 + Verb/Adjective'
  when '了 (le) for completed actions' then 'Verb + 了'
  when '因为...所以... (because...therefore...)' then '因为 + reason，所以 + result'
  when '把 (bǎ) construction' then 'Subject + 把 + Object + Verb + Complement'
  else pattern
end
where pattern is null;
