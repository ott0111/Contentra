-- PayPal billing migration. Run after 002_phase8_production.sql.
alter table public.subscriptions add column if not exists paypal_customer_id text;
alter table public.subscriptions add column if not exists paypal_subscription_id text;
create unique index if not exists subscriptions_paypal_subscription_idx on public.subscriptions(paypal_subscription_id) where paypal_subscription_id is not null;
create unique index if not exists subscriptions_paypal_customer_idx on public.subscriptions(paypal_customer_id) where paypal_customer_id is not null;

create table if not exists public.paypal_webhook_events (
  id uuid primary key default uuid_generate_v4(), event_id text not null unique, event_type text not null, processed_at timestamptz not null default now()
);
alter table public.paypal_webhook_events enable row level security;

-- Webhook events are service-role only; no client policies are intentional.
-- Existing legacy payment columns, if present, are left intact for non-destructive rollout.