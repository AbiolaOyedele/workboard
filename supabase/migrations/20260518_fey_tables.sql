-- fey_threads: one row per WhatsApp message received by the bot
create table if not exists public.fey_threads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  raw_message  text not null,
  heading      text not null,
  message_date date not null,
  created_at   timestamptz not null default now()
);

alter table public.fey_threads enable row level security;

create policy "fey_threads_select_own"
  on public.fey_threads for select
  using (auth.uid() = user_id);

create policy "fey_threads_insert_own"
  on public.fey_threads for insert
  with check (auth.uid() = user_id);

create policy "fey_threads_delete_own"
  on public.fey_threads for delete
  using (auth.uid() = user_id);

-- fey_tasks: tasks extracted from each thread
create table if not exists public.fey_tasks (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.fey_threads(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  notes       text,
  deadline    date,
  done        boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.fey_tasks enable row level security;

create policy "fey_tasks_insert_own"
  on public.fey_tasks for insert
  with check (auth.uid() = user_id);

create policy "fey_tasks_select_own"
  on public.fey_tasks for select
  using (auth.uid() = user_id);

create policy "fey_tasks_update_own"
  on public.fey_tasks for update
  using (auth.uid() = user_id);

create policy "fey_tasks_delete_own"
  on public.fey_tasks for delete
  using (auth.uid() = user_id);
