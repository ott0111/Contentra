-- Phase 11: YouTube daily analytics
-- Account-level analytics are kept separate from content_analytics.

create table if not exists public.youtube_analytics_daily (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'youtube' check (platform = 'youtube'),
  platform_account_id text not null,
  date date not null,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  subscribers_gained integer not null default 0,
  subscribers_lost integer not null default 0,
  watch_time_minutes numeric not null default 0,
  average_view_duration_seconds numeric not null default 0,
  estimated_revenue numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, platform_account_id, date)
);

create index if not exists youtube_analytics_daily_lookup_idx
  on public.youtube_analytics_daily(user_id, platform, platform_account_id, date desc);

alter table public.youtube_analytics_daily enable row level security;

create policy "Users manage own YouTube analytics"
  on public.youtube_analytics_daily
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);