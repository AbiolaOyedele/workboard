-- fey_sessions: stores the last numbered task list sent to each user over WhatsApp.
-- Used to resolve "done 1, 3" replies back to real task IDs.
-- One row per user — upserted on every list reply, expired after 1 hour in application code.

create table if not exists public.fey_sessions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  task_map   jsonb not null,           -- { "1": "task-uuid", "2": "task-uuid", ... }
  created_at timestamptz not null default now()
);

alter table public.fey_sessions enable row level security;

-- Users can only read their own session (the bot writes via service role, bypassing RLS)
create policy "fey_sessions_select_own"
  on public.fey_sessions for select
  using (auth.uid() = user_id);
