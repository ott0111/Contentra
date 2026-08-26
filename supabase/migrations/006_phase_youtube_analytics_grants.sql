-- Phase 12: YouTube analytics privileges
-- Keep RLS enabled. The sync worker uses the server-only service_role.

grant usage on schema public to service_role, authenticated;
grant select, insert, update, delete
  on table public.youtube_analytics_daily
  to service_role;
grant select
  on table public.youtube_analytics_daily
  to authenticated;
