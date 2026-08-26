-- Phase 13: shared daily analytics for Instagram, TikTok, and X

create table if not exists public.social_analytics_daily (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok', 'x')),
  platform_account_id text not null,
  date date not null,
  views integer not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  followers_gained integer not null default 0,
  followers_lost integer not null default 0,
  followers integer,
  watch_time_minutes numeric,
  average_view_duration_seconds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, platform_account_id, date)
);

create index if not exists social_analytics_daily_lookup_idx
  on public.social_analytics_daily(user_id, platform, platform_account_id, date desc);

alter table public.social_analytics_daily enable row level security;
create policy "Users manage own social analytics"
  on public.social_analytics_daily for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);