-- Add unique constraint so seed is idempotent via ON CONFLICT
alter table public.words add constraint words_hanzi_hsk_level_unique unique (hanzi, hsk_level);
