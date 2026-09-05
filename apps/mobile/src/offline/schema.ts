import type { DbHandle } from './ReviewStore';

const TARGET_USER_VERSION = 3;

const SCHEMA_V2_DDL = `
create table if not exists cached_cards (
  card_id text primary key,
  server_version integer not null,
  server_json text not null,
  projected_json text not null,
  updated_at text not null
);
create table if not exists pending_reviews (
  review_id text primary key,
  card_id text not null,
  grade integer not null check (grade in (1,2,3,4)),
  time_ms integer,
  skill text not null check (skill in ('recognition','recall','listening','reading','production')),
  state_json text not null,
  prior_json text not null,
  reviewed_at text not null,
  expected_version integer not null,
  queue_sequence integer not null unique,
  state text not null check (state in ('pending','syncing','permanent_error')),
  attempt_count integer not null default 0,
  last_error text
);
create table if not exists sync_meta (key text primary key, value text not null);
create index if not exists pending_reviews_card_sequence
  on pending_reviews(card_id, queue_sequence);
create table if not exists cached_readings (
  cache_key text primary key,
  value_json text not null,
  updated_at text not null
);
`;

const READING_CACHE_DDL = `
create table if not exists cached_readings (
  cache_key text primary key,
  value_json text not null,
  updated_at text not null
);
`;

const MIGRATE_V1_TO_V2 = `
begin;
create table pending_reviews_v2 (
  review_id text primary key,
  card_id text not null,
  grade integer not null check (grade in (1,2,3,4)),
  time_ms integer,
  skill text not null check (skill in ('recognition','recall','listening','reading','production')),
  state_json text not null,
  prior_json text not null,
  reviewed_at text not null,
  expected_version integer not null,
  queue_sequence integer not null unique,
  state text not null check (state in ('pending','syncing','permanent_error')),
  attempt_count integer not null default 0,
  last_error text
);
insert into pending_reviews_v2
  (review_id, card_id, grade, time_ms, skill, state_json, prior_json,
   reviewed_at, expected_version, queue_sequence, state, attempt_count, last_error)
select review_id, card_id,
  case when quality >= 5 then 4 when quality >= 4 then 3 when quality >= 2 then 2 else 1 end,
  time_ms, 'recognition', '{}', '{}', reviewed_at, expected_version,
  queue_sequence, state, attempt_count, last_error
from pending_reviews;
drop table pending_reviews;
alter table pending_reviews_v2 rename to pending_reviews;
create index pending_reviews_card_sequence
  on pending_reviews(card_id, queue_sequence);
commit;
`;

export async function applySchema(db: DbHandle): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  if (current === 0) {
    await db.execAsync(SCHEMA_V2_DDL);
    await db.execAsync(`PRAGMA user_version = ${TARGET_USER_VERSION}`);
  } else if (current === 1) {
    await db.execAsync(MIGRATE_V1_TO_V2);
    await db.execAsync(READING_CACHE_DDL);
    await db.execAsync(`PRAGMA user_version = ${TARGET_USER_VERSION}`);
  } else if (current === 2) {
    await db.execAsync(READING_CACHE_DDL);
    await db.execAsync(`PRAGMA user_version = ${TARGET_USER_VERSION}`);
  }
}
