-- Phase 14: social analytics privileges
-- Keep RLS enabled; server sync writes with the server-only service role.

grant usage on schema public to service_role, authenticated;
grant select, insert, update, delete
  on table public.social_analytics_daily
  to service_role;
grant select
  on table public.social_analytics_daily
  to authenticated;