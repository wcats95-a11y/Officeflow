-- OfficeFlow Income-tax matter management v2
-- Additive and rerunnable: preserves the existing JSON workspace payload and all current records.
alter table public.officeflow_workspace_state
  add column if not exists schema_version integer not null default 1;

update public.officeflow_workspace_state
set payload = payload
  || jsonb_build_object(
    'matterTypes', coalesce(payload->'matterTypes', '[]'::jsonb),
    'matterTaskTypes', coalesce(payload->'matterTaskTypes', '[]'::jsonb),
    'clientGroups', coalesce(payload->'clientGroups', '[]'::jsonb),
    'matters', coalesce(payload->'matters', '[]'::jsonb),
    'matterRounds', coalesce(payload->'matterRounds', '[]'::jsonb)
  ),
  schema_version = greatest(schema_version, 2),
  updated_at = now()
where jsonb_typeof(payload) = 'object';

-- Explicit relational structures for future normalized persistence. Existing JSON workspace
-- remains the source of truth during rollout; no live task/client rows are rewritten.
create table if not exists public.officeflow_client_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.officeflow_workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);
create table if not exists public.officeflow_client_group_members (
  group_id uuid not null references public.officeflow_client_groups(id) on delete cascade,
  client_id uuid not null references public.officeflow_clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, client_id)
);
create table if not exists public.officeflow_matters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.officeflow_workspaces(id) on delete cascade,
  client_id uuid not null references public.officeflow_clients(id) on delete cascade,
  name text not null,
  matter_type text not null default 'Assessment',
  act text not null default 'Income-tax Act, 1961'
    check (act in ('Income-tax Act, 1961','Income-tax Act, 2025')),
  financial_year text,
  assessment_year text,
  tax_year text,
  next_action text,
  due_date date,
  status text not null default 'Open',
  legacy_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (act = 'Income-tax Act, 1961' and tax_year is null)
    or (act = 'Income-tax Act, 2025' and financial_year is null and assessment_year is null)
  )
);
create table if not exists public.officeflow_matter_rounds (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.officeflow_matters(id) on delete cascade,
  round_type text not null,
  sequence_number integer not null check (sequence_number > 0),
  notice_number text,
  notice_date date,
  due_date date,
  hearing_at timestamptz,
  reply_status text not null default 'Not started'
    check (reply_status in ('Not started','Partially replied','Fully replied')),
  hearing_outcome text check (hearing_outcome is null or hearing_outcome in ('Scheduled','Attended','Adjourned','Order reserved','Order passed')),
  next_hearing_date date,
  outcome text,
  notes text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matter_id, round_type, sequence_number)
);
create table if not exists public.officeflow_matter_type_config (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.officeflow_workspaces(id) on delete cascade,
  act text not null check (act in ('Income-tax Act, 1961','Income-tax Act, 2025')),
  matter_type text not null,
  task_type text not null,
  section_reference text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, act, matter_type, task_type)
);
create table if not exists public.officeflow_task_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.officeflow_workspaces(id) on delete cascade,
  task_id text not null,
  round_id uuid references public.officeflow_matter_rounds(id) on delete set null,
  old_status text,
  new_status text not null,
  note text,
  follow_up_date date,
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text,
  created_at timestamptz not null default now()
);

create index if not exists officeflow_matters_client_idx on public.officeflow_matters(workspace_id, client_id);
create index if not exists officeflow_rounds_matter_idx on public.officeflow_matter_rounds(matter_id, sequence_number);
create index if not exists officeflow_groups_workspace_idx on public.officeflow_client_groups(workspace_id);

-- RLS: a workspace owner or a member of that workspace may access its records.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'officeflow_client_groups','officeflow_matters','officeflow_matter_type_config','officeflow_task_status_history'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists workspace_member_all on public.%I', tbl);
    execute format(
      'create policy workspace_member_all on public.%I for all using (
        exists (
          select 1 from public.officeflow_workspaces w
          where w.id = workspace_id
            and (w.owner_id = auth.uid() or exists (
              select 1 from public.officeflow_workspace_members m
              where m.workspace_owner_id = w.owner_id and m.user_id = auth.uid()
            ))
        )
      ) with check (
        exists (
          select 1 from public.officeflow_workspaces w
          where w.id = workspace_id
            and (w.owner_id = auth.uid() or exists (
              select 1 from public.officeflow_workspace_members m
              where m.workspace_owner_id = w.owner_id and m.user_id = auth.uid()
            ))
        )
      )', tbl
    );
  end loop;
end $$;

alter table public.officeflow_client_group_members enable row level security;
drop policy if exists workspace_member_all on public.officeflow_client_group_members;
create policy workspace_member_all on public.officeflow_client_group_members for all
using (exists (
  select 1 from public.officeflow_client_groups g
  join public.officeflow_workspaces w on w.id = g.workspace_id
  where g.id = group_id and (
    w.owner_id = auth.uid() or exists (
      select 1 from public.officeflow_workspace_members m
      where m.workspace_owner_id = w.owner_id and m.user_id = auth.uid()
    )
  )
))
with check (exists (
  select 1 from public.officeflow_client_groups g
  join public.officeflow_workspaces w on w.id = g.workspace_id
  where g.id = group_id and (
    w.owner_id = auth.uid() or exists (
      select 1 from public.officeflow_workspace_members m
      where m.workspace_owner_id = w.owner_id and m.user_id = auth.uid()
    )
  )
));

alter table public.officeflow_matter_rounds enable row level security;
drop policy if exists workspace_member_all on public.officeflow_matter_rounds;
create policy workspace_member_all on public.officeflow_matter_rounds for all
using (exists (
  select 1 from public.officeflow_matters x
  join public.officeflow_workspaces w on w.id = x.workspace_id
  where x.id = matter_id and (
    w.owner_id = auth.uid() or exists (
      select 1 from public.officeflow_workspace_members m
      where m.workspace_owner_id = w.owner_id and m.user_id = auth.uid()
    )
  )
))
with check (exists (
  select 1 from public.officeflow_matters x
  join public.officeflow_workspaces w on w.id = x.workspace_id
  where x.id = matter_id and (
    w.owner_id = auth.uid() or exists (
      select 1 from public.officeflow_workspace_members m
      where m.workspace_owner_id = w.owner_id and m.user_id = auth.uid()
    )
  )
));
