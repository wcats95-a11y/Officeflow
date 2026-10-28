create table if not exists public.officeflow_workspace_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  payload jsonb not null default '{"tasks":[],"juniorDirectory":{},"clientDirectory":[]}'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.officeflow_workspace_state enable row level security;
drop policy if exists "owner can access own officeflow state" on public.officeflow_workspace_state;
create policy "owner can access own officeflow state"
  on public.officeflow_workspace_state
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.officeflow_workspace_state to authenticated;
create index if not exists officeflow_workspace_state_updated_at_idx
  on public.officeflow_workspace_state(updated_at desc);
