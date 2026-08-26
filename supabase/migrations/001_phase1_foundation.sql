create extension if not exists "uuid-ossp";
create table if not exists public.profiles (id uuid primary key default uuid_generate_v4(), user_id uuid not null unique references auth.users(id) on delete cascade, username text unique, display_name text, bio text, avatar_url text, niche text, target_audience text, tone text, experience_level text, primary_goal text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can create their own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own profile" on public.profiles for delete using (auth.uid() = user_id);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles (user_id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email)); return new; end; $$;
create or replace trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();