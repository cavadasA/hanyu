import type { DbHandle } from './ReviewStore';

const TARGET_USER_VERSION = 1;

const SCHEMA_V1_DDL = `
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
  quality integer not null check (quality between 0 and 5),
  time_ms integer,
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
`;

export async function applySchema(db: DbHandle): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  if (current < TARGET_USER_VERSION) {
    await db.execAsync(SCHEMA_V1_DDL);
    await db.execAsync(`PRAGMA user_version = ${TARGET_USER_VERSION}`);
  }
}
