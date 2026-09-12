-- 001_init.sql
-- Core schema per design doc Section 3, plus full-text search (Section 8: Postgres tsvector, no Elasticsearch needed yet)

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table channels (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  youtube_channel_id text not null unique,
  tier               text not null check (tier in ('curated', 'discovered')),
  created_at         timestamptz not null default now()
);

create table videos (
  id                uuid primary key default gen_random_uuid(),
  channel_id        uuid not null references channels(id) on delete cascade,
  youtube_video_id  text not null unique,
  title             text not null,
  description       text not null default '',
  published_at      timestamptz not null,
  duration_seconds  integer,
  view_count        bigint,
  ingested_at       timestamptz not null default now(),
  classified_at     timestamptz, -- null until the classification pipeline has run

  -- generated tsvector for full-text search over title + description
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);

create index videos_search_vector_idx on videos using gin (search_vector);
create index videos_channel_id_idx on videos (channel_id);
create index videos_published_at_idx on videos (published_at desc);
create index videos_classified_at_idx on videos (classified_at) where classified_at is null; -- fast "needs classification" queue

create table transcripts (
  video_id   uuid primary key references videos(id) on delete cascade,
  text       text not null,
  source     text not null check (source in ('caption', 'whisper')),
  fetched_at timestamptz not null default now(),

  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(text, ''))
  ) stored
);

create index transcripts_search_vector_idx on transcripts using gin (search_vector);

create table tags (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references videos(id) on delete cascade,
  tag        text not null,
  category   text not null check (category in ('instrument', 'strategy', 'methodology', 'format', 'timeframe')),
  confidence text not null check (confidence in ('high', 'low')),
  created_at timestamptz not null default now(),

  unique (video_id, tag, category)
);

create index tags_video_id_idx on tags (video_id);
create index tags_category_tag_idx on tags (category, tag); -- powers /facets counts

create table saved_searches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  name            text not null,
  filter_spec     jsonb not null, -- shared shape used by UI, API query params, and this table
  created_at      timestamptz not null default now(),
  last_notified_at timestamptz
);

create index saved_searches_user_id_idx on saved_searches (user_id);

create table notifications (
  id               uuid primary key default gen_random_uuid(),
  saved_search_id  uuid not null references saved_searches(id) on delete cascade,
  video_id         uuid not null references videos(id) on delete cascade,
  sent_at          timestamptz not null default now(),
  channel          text not null check (channel in ('email', 'push')),

  unique (saved_search_id, video_id) -- a video only ever triggers one notification per saved search
);
