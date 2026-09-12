-- 002_users.sql
-- The original schema had saved_searches.user_id with nothing to join
-- against for an email address. Adding a minimal users table now — this is
-- also where auth (Section 10 future work) will eventually hang its data.

create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table saved_searches
  add constraint saved_searches_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;
