-- Upgrade databases that applied 0401 while reading.target_grammar was text[].
-- New installs already receive jsonb from 0401, so this is intentionally
-- idempotent and contains no transaction wrapper.
do $$
declare
  target_grammar_type text;
begin
  select udt_name
  into target_grammar_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'reading'
    and column_name = 'target_grammar';

  if target_grammar_type = '_text' then
    execute 'alter table public.reading alter column target_grammar type jsonb using to_jsonb(target_grammar)';
  elsif target_grammar_type is null then
    execute 'alter table public.reading add column target_grammar jsonb not null default ''[]''::jsonb';
  end if;
end;
$$;

-- Preserve the level that was resolved into content_teaches when 0401 saw
-- legacy string arrays. The JSON metadata is authoritative from this point.
update public.reading as r
set target_grammar = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object('code', target.code, 'level', g.hsk_level)
      order by target.ordinality
    )
    from jsonb_array_elements_text(r.target_grammar)
      with ordinality as target(code, ordinality)
    join public.content_item ci
      on ci.source_table = 'reading' and ci.source_id = r.slug
    join public.content_teaches ct
      on ct.content_id = ci.id
     and ct.target_kind = 'grammar'
    join public.grammar_points g
      on g.id = ct.target_id and g.code = target.code
  ),
  '[]'::jsonb
)
where jsonb_typeof(r.target_grammar) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(r.target_grammar) item
    where jsonb_typeof(item) = 'string'
  );
