-- Re-seeding must update an exercise by its stable seed slug, not by the
-- editable prompt/answer payload.

delete from public.generated_exercises duplicate
using public.generated_exercises keeper
where duplicate.source_model = 'seed'
  and keeper.source_model = 'seed'
  and nullif(duplicate.prompt->>'slug', '') is not null
  and duplicate.prompt->>'slug' = keeper.prompt->>'slug'
  and (
    duplicate.created_at < keeper.created_at
    or (duplicate.created_at = keeper.created_at and duplicate.id < keeper.id)
  );

create unique index if not exists idx_generated_exercises_seed_slug
  on public.generated_exercises ((prompt->>'slug'))
  where source_model = 'seed'
    and nullif(prompt->>'slug', '') is not null;
