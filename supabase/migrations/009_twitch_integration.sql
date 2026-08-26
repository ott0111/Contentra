-- Phase 15: Twitch account snapshots and normalized analytics support
alter table public.social_analytics_daily drop constraint if exists social_analytics_daily_platform_check;
alter table public.social_analytics_daily add constraint social_analytics_daily_platform_check check (platform in ('instagram', 'tiktok', 'x', 'twitch'));
alter table public.social_analytics_daily add column if not exists stream_duration_minutes numeric;
alter table public.social_analytics_daily add column if not exists average_sampled_viewers numeric;
alter table public.social_analytics_daily add column if not exists peak_sampled_viewers numeric;

create table if not exists public.twitch_stream_snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_account_id text not null,
  stream_id text not null,
  started_at timestamptz not null,
  observed_at timestamptz not null default now(),
  viewer_count integer not null default 0,
  game_id text,
  game_name text,
  title text,
  created_at timestamptz not null default now(),
  unique (user_id, platform_account_id, stream_id, observed_at)
);

create index if not exists twitch_stream_snapshots_lookup_idx
  on public.twitch_stream_snapshots(user_id, platform_account_id, observed_at desc);

create table if not exists public.twitch_videos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_account_id text not null,
  video_id text not null,
  stream_id text,
  title text not null default '',
  created_at timestamptz not null,
  published_at timestamptz,
  url text,
  view_count integer not null default 0,
  duration_seconds numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, platform_account_id, video_id)
);

create index if not exists twitch_videos_lookup_idx
  on public.twitch_videos(user_id, platform_account_id, created_at desc);

alter table public.twitch_stream_snapshots enable row level security;
create policy "Users manage own Twitch stream snapshots"
  on public.twitch_stream_snapshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.twitch_videos enable row level security;
create policy "Users manage own Twitch videos"
  on public.twitch_videos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
