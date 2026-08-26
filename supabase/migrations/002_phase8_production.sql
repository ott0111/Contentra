-- Phase 8 production data model. Run after 001_phase1_foundation.sql.
alter table public.profiles add column if not exists platforms text[] not null default '{}';
alter table public.profiles add column if not exists content_styles text[] not null default '{}';
alter table public.profiles add column if not exists experience_level text;
alter table public.profiles add column if not exists notification_preferences jsonb not null default '{"productUpdates":true,"contentReminders":true,"scheduledContentReminders":true,"weeklyGrowthSummary":true,"aiRecommendations":true}';

create table if not exists public.platforms (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null, username text, platform_user_id text, access_token text, refresh_token text,
  connected boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.content (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '', body text not null, content_type text not null default 'General Post', platform text not null,
  status text not null default 'DRAFT', tags text[] not null default '{}', scheduled_at timestamptz, published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.content_ideas (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text not null default '', hook text not null default '', angle text not null default '',
  platform text not null, category text not null default '', score integer, used boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.content_analytics (
  id uuid primary key default uuid_generate_v4(), content_id uuid not null references public.content(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, views integer not null default 0, likes integer not null default 0,
  comments integer not null default 0, shares integer not null default 0, saves integer not null default 0,
  followers_gained integer not null default 0, engagement_rate numeric, recorded_at timestamptz not null default now()
);
create table if not exists public.content_analysis (
  id uuid primary key default uuid_generate_v4(), content_id uuid references public.content(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade, overall_score integer not null check (overall_score between 0 and 100),
  hook_score integer not null check (hook_score between 0 and 100), clarity_score integer not null check (clarity_score between 0 and 100),
  value_score integer not null check (value_score between 0 and 100), engagement_score integer not null check (engagement_score between 0 and 100),
  shareability_score integer not null check (shareability_score between 0 and 100), cta_score integer not null check (cta_score between 0 and 100),
  strengths jsonb not null default '[]', weaknesses jsonb not null default '[]', recommendations jsonb not null default '[]', improved_content text,
  created_at timestamptz not null default now()
);
alter table public.content_analysis add column if not exists title text not null default '';
alter table public.content_analysis add column if not exists content text not null default '';
alter table public.content_analysis add column if not exists platform text not null default '';
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null unique references auth.users(id) on delete cascade,
  paypal_customer_id text unique, paypal_subscription_id text unique, plan text not null default 'FREE', status text not null default 'active',
  current_period_end timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.ai_usage (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null, tokens_used integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.coach_insights (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null, strengths jsonb not null default '[]', opportunities jsonb not null default '[]',
  recommendations jsonb not null default '[]', weekly_plan jsonb not null default '[]', created_at timestamptz not null default now()
);

create index if not exists platforms_user_id_idx on public.platforms(user_id);
create index if not exists content_user_created_idx on public.content(user_id, created_at desc);
create index if not exists content_user_scheduled_idx on public.content(user_id, scheduled_at);
create index if not exists ideas_user_created_idx on public.content_ideas(user_id, created_at desc);
create index if not exists analytics_user_recorded_idx on public.content_analytics(user_id, recorded_at desc);
create index if not exists analytics_content_idx on public.content_analytics(content_id);
create index if not exists analysis_user_created_idx on public.content_analysis(user_id, created_at desc);
create index if not exists analysis_content_idx on public.content_analysis(content_id);
create index if not exists subscriptions_customer_idx on public.subscriptions(paypal_customer_id);
create index if not exists usage_user_created_idx on public.ai_usage(user_id, created_at desc);
create index if not exists coach_user_created_idx on public.coach_insights(user_id, created_at desc);

alter table public.platforms enable row level security;
alter table public.content enable row level security;
alter table public.content_ideas enable row level security;
alter table public.content_analytics enable row level security;
alter table public.content_analysis enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.coach_insights enable row level security;

create policy "Users manage own platforms" on public.platforms for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own content" on public.content for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own ideas" on public.content_ideas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own analytics" on public.content_analytics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users view own analysis" on public.content_analysis for select using (auth.uid() = user_id);
create policy "Users create own analysis" on public.content_analysis for insert with check (auth.uid() = user_id);
create policy "Users update own analysis" on public.content_analysis for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own analysis" on public.content_analysis for delete using (auth.uid() = user_id);
create policy "Users view own subscription" on public.subscriptions for select using (auth.uid() = user_id);
create policy "Users view own usage" on public.ai_usage for select using (auth.uid() = user_id);
create policy "Users manage own coach insights" on public.coach_insights for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Server-side service-role code controls subscription and usage writes.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email)) on conflict (user_id) do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end; $$;
