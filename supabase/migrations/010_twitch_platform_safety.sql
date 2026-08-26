-- Verify the existing data before adding the conflict target required by social OAuth upserts.
do $$
begin
  if exists (
    select 1
    from public.platforms
    group by user_id, platform
    having count(*) > 1
  ) then
    raise exception 'Duplicate platform rows found for the same user and platform; resolve them before applying this migration.';
  end if;
end $$;

create unique index if not exists platforms_user_platform_unique_idx
  on public.platforms(user_id, platform);

alter table public.twitch_stream_snapshots
  add column if not exists ended_at timestamptz;