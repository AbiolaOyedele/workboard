-- Enable Supabase Realtime on Fey tables.
-- Tables created via SQL migration are not automatically added to the
-- supabase_realtime publication — this must be done explicitly.

-- REPLICA IDENTITY FULL is required so UPDATE events include the full row,
-- allowing server-side filters (user_id=eq.X) to work on UPDATE/DELETE events.

alter table public.fey_threads replica identity full;
alter table public.fey_tasks   replica identity full;

do $$
begin
  -- Add to publication only if not already a member (idempotent)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fey_threads'
  ) then
    alter publication supabase_realtime add table public.fey_threads;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fey_tasks'
  ) then
    alter publication supabase_realtime add table public.fey_tasks;
  end if;
end $$;
