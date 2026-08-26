-- Phase 10: OAuth Foundation and Platform Analytics
-- Enhances platforms table for OAuth support and adds platform-level analytics

-- Enhance platforms table with OAuth token metadata
alter table public.platforms add column if not exists token_expires_at timestamptz;
alter table public.platforms add column if not exists scope text;
alter table public.platforms add column if not exists last_synced_at timestamptz;
alter table public.platforms add column if not exists updated_at timestamptz not null default now();

-- Create platform_analytics table for daily/period snapshots of platform-level metrics
create table if not exists public.platform_analytics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_id uuid not null references public.platforms(id) on delete cascade,
  platform text not null,
  followers integer not null default 0,
  total_views integer not null default 0,
  engagement_rate numeric,
  recorded_at timestamptz not null default now()
);

-- Add platform source tracking to content_analytics
alter table public.content_analytics add column if not exists platform_source text;
alter table public.content_analytics add column if not exists platform_id uuid references public.platforms(id) on delete set null;

-- Indexes for efficient querying
create index if not exists platform_analytics_user_platform_idx on public.platform_analytics(user_id, platform_id);
create index if not exists platform_analytics_recorded_idx on public.platform_analytics(user_id, recorded_at desc);
create index if not exists content_analytics_platform_source_idx on public.content_analytics(user_id, platform_source);
create index if not exists platforms_user_platform_idx on public.platforms(user_id, platform);

-- Enable RLS on platform_analytics
alter table public.platform_analytics enable row level security;
create policy "Users manage own platform analytics" on public.platform_analytics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Note: YouTube OAuth tokens are stored encrypted in access_token/refresh_token columns.
-- Token exchange and refresh happen server-side only, never exposed to client.
-- access_token: encrypted OAuth access token (server decrypts for API calls)
-- refresh_token: encrypted OAuth refresh token (server uses for token renewal)
-- token_expires_at: expiration timestamp of access_token
-- scope: OAuth scopes granted (for auditing)
-- last_synced_at: timestamp of last analytics sync from platform
-- connected: boolean flag indicating active connection
