-- OfficeFlow shared workspace roles, scoped RPC access, and task audit trail.
-- Existing workspace payloads remain intact; junior access is mediated through scoped RPCs.
create schema if not exists officeflow_private;
grant usage on schema officeflow_private to authenticated;

create table if not exists public.officeflow_workspace_members (
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null check (role in ('manager','junior')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_owner_id, user_id),
  check (workspace_owner_id <> user_id)
);
create unique index if not exists officeflow_workspace_members_one_workspace_per_user
  on public.officeflow_workspace_members(user_id);
alter table public.officeflow_workspace_members enable row level security;
revoke all on public.officeflow_workspace_members from anon, authenticated;
drop policy if exists officeflow_members_deny_direct_access on public.officeflow_workspace_members;
create policy officeflow_members_deny_direct_access on public.officeflow_workspace_members for all to authenticated using (false) with check (false);

create table if not exists public.officeflow_task_audit (
  id bigint generated always as identity primary key,
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.officeflow_task_audit enable row level security;
revoke all on public.officeflow_task_audit from anon, authenticated;
drop policy if exists officeflow_audit_deny_direct_access on public.officeflow_task_audit;
create policy officeflow_audit_deny_direct_access on public.officeflow_task_audit for all to authenticated using (false) with check (false);

CREATE OR REPLACE FUNCTION officeflow_private.officeflow_get_workspace_impl()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_role text; v_display_name text; v_email text;
  v_payload jsonb; v_visible_tasks jsonb; v_members jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select m.workspace_owner_id, m.role, m.display_name into v_owner, v_role, v_display_name
    from public.officeflow_workspace_members m where m.user_id = v_uid order by m.created_at limit 1;
  if v_owner is null then
    v_owner := v_uid; v_role := 'manager';
    v_display_name := coalesce(nullif(split_part(coalesce(v_email,''),'@',1),''),'Manager');
  end if;
  insert into public.officeflow_workspace_state(owner_id,payload,schema_version,updated_at)
  values(v_owner,jsonb_build_object('tasks','[]'::jsonb,'auditLog','[]'::jsonb,'clientDirectory','[]'::jsonb,'juniorDirectory','{}'::jsonb,'dark',false,'remindersEnabled',false),1,now())
  on conflict(owner_id) do nothing;
  select s.payload into v_payload from public.officeflow_workspace_state s where s.owner_id=v_owner;
  if v_role='manager' then
    select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',m.email,'display_name',m.display_name,'role',m.role,'created_at',m.created_at) order by m.created_at),'[]'::jsonb)
      into v_members from public.officeflow_workspace_members m where m.workspace_owner_id=v_owner;
    return jsonb_build_object('payload',coalesce(v_payload,'{}'::jsonb),'role',v_role,'display_name',v_display_name,'workspace_owner_id',v_owner,'members',v_members,'email',coalesce(v_email,''));
  end if;
  select coalesce(jsonb_agg((t.task - array['billingStatus','billingOwner','billingAmount','amountPaid','paymentStatus','filingAckDocument','uploadedDocuments','documentLinks','filingAck','lastFollowUpOutcome']) order by t.ordinality),'[]'::jsonb)
    into v_visible_tasks
    from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) with ordinality as t(task,ordinality)
    where coalesce(t.task->>'createdByUserId','')=v_uid::text
       or exists(select 1 from jsonb_array_elements_text(coalesce(t.task->'juniors','[]'::jsonb)) assigned(name) where lower(trim(assigned.name))=lower(trim(v_display_name)));
  v_payload := jsonb_set(coalesce(v_payload,'{}'::jsonb),'{tasks}',v_visible_tasks,true);
  v_payload := jsonb_set(v_payload,'{clientDirectory}','[]'::jsonb,true);
  v_payload := jsonb_set(v_payload,'{juniorDirectory}','{}'::jsonb,true);
  v_payload := jsonb_set(v_payload,'{auditLog}','[]'::jsonb,true);
  return jsonb_build_object('payload',v_payload,'role',v_role,'display_name',v_display_name,'workspace_owner_id',v_owner,'members','[]'::jsonb,'email',coalesce(v_email,''));
end;
$function$
;
CREATE OR REPLACE FUNCTION officeflow_private.officeflow_register_member_impl(p_email text, p_role text, p_display_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_caller_role text; v_target_id uuid; v_target_email text; v_name text;
  v_target_payload jsonb;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if lower(coalesce(p_role,'')) not in ('manager','junior') then raise exception 'Role must be manager or junior'; end if;
  if nullif(trim(coalesce(p_email,'')),'') is null then raise exception 'Email is required'; end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null then raise exception 'Display name is required'; end if;
  select m.workspace_owner_id,m.role into v_owner,v_caller_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_caller_role:='manager'; end if;
  if v_caller_role<>'manager' then raise exception 'Only managers can add workspace members'; end if;
  select u.id,u.email into v_target_id,v_target_email from auth.users u where lower(u.email)=lower(trim(p_email)) limit 1;
  if v_target_id is null then raise exception 'This email has no OfficeFlow account yet. Ask the person to sign up and then add them here.'; end if;
  if v_target_id=v_owner then raise exception 'The workspace owner already has manager access'; end if;
  if exists(select 1 from public.officeflow_workspace_members m where m.user_id=v_target_id and m.workspace_owner_id<>v_owner) then
    raise exception 'This account already belongs to another OfficeFlow workspace';
  end if;
  select s.payload into v_target_payload from public.officeflow_workspace_state s where s.owner_id=v_target_id;
  if v_target_id<>v_owner and (
    jsonb_array_length(coalesce(v_target_payload->'tasks','[]'::jsonb))>0
    or jsonb_array_length(coalesce(v_target_payload->'clientDirectory','[]'::jsonb))>0
  ) then
    raise exception 'This account already has workspace data. Export a backup and clear or migrate that workspace before joining another workspace.';
  end if;
  v_name:=trim(p_display_name);
  insert into public.officeflow_workspace_members(workspace_owner_id,user_id,email,display_name,role,invited_by,updated_at)
  values(v_owner,v_target_id,coalesce(v_target_email,lower(trim(p_email))),v_name,lower(p_role),v_uid,now())
  on conflict(workspace_owner_id,user_id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,invited_by=excluded.invited_by,updated_at=now();
  return jsonb_build_object('user_id',v_target_id,'email',coalesce(v_target_email,lower(trim(p_email))),'display_name',v_name,'role',lower(p_role));
end;
$function$
;
CREATE OR REPLACE FUNCTION officeflow_private.officeflow_save_workspace_impl(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_role text; v_display_name text; v_existing jsonb; v_next_payload jsonb;
  v_old_task jsonb; v_submitted jsonb; v_safe jsonb; v_updated jsonb; v_new_task jsonb;
  v_tasks jsonb := '[]'::jsonb; v_changed text[]; v_task_id text; v_found boolean; v_keep_existing boolean; v_existing_activity_at text; v_submitted_activity_at text;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Workspace payload must be an object'; end if;
  select m.workspace_owner_id,m.role,m.display_name into v_owner,v_role,v_display_name from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; v_display_name:='Manager'; end if;
  select s.payload into v_existing from public.officeflow_workspace_state s where s.owner_id=v_owner for update;
  if v_existing is null then raise exception 'Workspace was not initialized; reload OfficeFlow'; end if;

  if v_role='manager' then
    for v_old_task in select value from jsonb_array_elements(coalesce(v_existing->'tasks','[]'::jsonb))
    loop
      v_task_id:=v_old_task->>'id'; v_submitted:=null;
      select value into v_submitted from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb)) where value->>'id'=v_task_id limit 1;
      if found then
        select max(coalesce(e.value->>'at','')) into v_existing_activity_at from jsonb_array_elements(coalesce(v_old_task->'activity','[]'::jsonb)) e(value);
        select max(coalesce(e.value->>'at','')) into v_submitted_activity_at from jsonb_array_elements(coalesce(v_submitted->'activity','[]'::jsonb)) e(value);
        v_keep_existing := coalesce(v_existing_activity_at,'') > coalesce(v_submitted_activity_at,'');
        if v_keep_existing then v_updated:=v_old_task; else v_updated:=v_submitted; end if;
        if not v_keep_existing then
          select coalesce(array_agg(e.key order by e.key),'{}'::text[]) into v_changed
            from jsonb_each(v_submitted) e where v_old_task->e.key is distinct from e.value and e.key<>'activity';
          if cardinality(v_changed)>0 then
            insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields)
            values(v_owner,coalesce(v_task_id,'unknown'),v_uid,'task_updated',v_changed);
          end if;
        end if;
      else
        -- A stale manager client may not yet have received a junior's new task. Preserve it.
        v_updated:=v_old_task;
      end if;
      v_tasks:=v_tasks||jsonb_build_array(v_updated);
    end loop;
    for v_submitted in select value from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb))
    loop
      if not exists(select 1 from jsonb_array_elements(coalesce(v_existing->'tasks','[]'::jsonb)) x(value) where x.value->>'id'=v_submitted->>'id') then
        v_tasks:=v_tasks||jsonb_build_array(v_submitted);
        insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields)
        values(v_owner,coalesce(v_submitted->>'id','unknown'),v_uid,'task_created',array['task']);
      end if;
    end loop;
    v_next_payload:=jsonb_set(p_payload,'{tasks}',v_tasks,true);
    update public.officeflow_workspace_state set payload=v_next_payload,schema_version=greatest(schema_version,1),updated_at=now() where owner_id=v_owner;
    return jsonb_build_object('ok',true,'role',v_role);
  end if;

  for v_old_task in select value from jsonb_array_elements(coalesce(v_existing->'tasks','[]'::jsonb))
  loop
    v_submitted:=null;
    select value into v_submitted from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb)) where value->>'id'=v_old_task->>'id' limit 1;
    v_found:=found;
    if v_found and (coalesce(v_old_task->>'createdByUserId','')=v_uid::text or exists(select 1 from jsonb_array_elements_text(coalesce(v_old_task->'juniors','[]'::jsonb)) assigned(name) where lower(trim(assigned.name))=lower(trim(v_display_name)))) then
      v_safe:=v_submitted-array['billingStatus','billingOwner','billingAmount','amountPaid','paymentStatus','filingAckDocument','uploadedDocuments','documentLinks','filingAck','lastFollowUpOutcome','juniors','preparer','reviewer','approvalStatus','createdByUserId','approvedBy','approvedAt','activity'];
      select coalesce(array_agg(e.key order by e.key),'{}'::text[]) into v_changed from jsonb_each(v_safe) e where v_old_task->e.key is distinct from e.value;
      v_updated:=v_old_task||v_safe;
      v_updated:=jsonb_set(v_updated,'{activity}',coalesce(v_old_task->'activity','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'actor',v_display_name,'message',case when cardinality(v_changed)>0 then 'Task updated: '||array_to_string(v_changed,', ') else 'Task opened for editing' end)),true);
      if coalesce(v_old_task->>'approvalStatus','approved') in ('pending','changes_requested') then
        v_updated:=jsonb_set(v_updated,'{status}',case when v_old_task->>'approvalStatus'='pending' then '"To Do"'::jsonb else '"Rework required"'::jsonb end,true);
      end if;
      if cardinality(v_changed)>0 then insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields) values(v_owner,coalesce(v_old_task->>'id','unknown'),v_uid,'task_updated',v_changed); end if;
      v_tasks:=v_tasks||jsonb_build_array(v_updated);
    else v_tasks:=v_tasks||jsonb_build_array(v_old_task);
    end if;
  end loop;

  for v_submitted in select value from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb))
  loop
    if not exists(select 1 from jsonb_array_elements(coalesce(v_existing->'tasks','[]'::jsonb)) x(value) where x.value->>'id'=v_submitted->>'id') then
      v_safe:=v_submitted-array['billingStatus','billingOwner','billingAmount','amountPaid','paymentStatus','filingAckDocument','uploadedDocuments','documentLinks','filingAck','lastFollowUpOutcome','juniors','preparer','reviewer','approvalStatus','createdByUserId','approvedBy','approvedAt','activity'];
      v_task_id:=coalesce(nullif(v_submitted->>'id',''),gen_random_uuid()::text);
      v_new_task:=v_safe||jsonb_build_object('id',v_task_id,'createdByUserId',v_uid::text,'approvalStatus','pending','status','To Do','juniors',jsonb_build_array(v_display_name),'preparer',v_display_name,'activity',jsonb_build_array(jsonb_build_object('at',now(),'actor',v_display_name,'message','Task submitted as draft; awaiting manager approval')));
      v_tasks:=v_tasks||jsonb_build_array(v_new_task);
      insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields) values(v_owner,v_task_id,v_uid,'task_created_pending_approval',array['task','approvalStatus']);
    end if;
  end loop;
  v_next_payload:=jsonb_set(coalesce(v_existing,'{}'::jsonb),'{tasks}',v_tasks,true);
  update public.officeflow_workspace_state set payload=v_next_payload,schema_version=greatest(schema_version,1),updated_at=now() where owner_id=v_owner;
  return jsonb_build_object('ok',true,'role',v_role);
end;
$function$
;
CREATE OR REPLACE FUNCTION officeflow_private.officeflow_delete_task_impl(p_task_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_role text; v_payload jsonb; v_exists boolean;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_role<>'manager' then raise exception 'Only managers can delete tasks'; end if;
  select s.payload into v_payload from public.officeflow_workspace_state s where s.owner_id=v_owner for update;
  if v_payload is null then raise exception 'Workspace not found'; end if;
  select exists(select 1 from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) x(value) where x.value->>'id'=p_task_id) into v_exists;
  if not v_exists then return jsonb_build_object('ok',true,'deleted',false); end if;
  insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields)
  values(v_owner,p_task_id,v_uid,'task_deleted',array['task']);
  update public.officeflow_workspace_state
     set payload=jsonb_set(v_payload,'{tasks}',(
       select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb)
       from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) with ordinality x(value,ordinality)
       where x.value->>'id'<>p_task_id
     ),true),updated_at=now()
   where owner_id=v_owner;
  return jsonb_build_object('ok',true,'deleted',true);
end;
$function$
;

revoke all on function officeflow_private.officeflow_get_workspace_impl() from public, anon;
revoke all on function officeflow_private.officeflow_register_member_impl(text,text,text) from public, anon;
revoke all on function officeflow_private.officeflow_save_workspace_impl(jsonb) from public, anon;
revoke all on function officeflow_private.officeflow_delete_task_impl(text) from public, anon;
grant execute on function officeflow_private.officeflow_get_workspace_impl() to authenticated;
grant execute on function officeflow_private.officeflow_register_member_impl(text,text,text) to authenticated;
grant execute on function officeflow_private.officeflow_save_workspace_impl(jsonb) to authenticated;
grant execute on function officeflow_private.officeflow_delete_task_impl(text) to authenticated;

create or replace function public.officeflow_get_workspace()
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_get_workspace_impl(); $$;
create or replace function public.officeflow_register_member(p_email text,p_role text,p_display_name text)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_register_member_impl(p_email,p_role,p_display_name); $$;
create or replace function public.officeflow_save_workspace(p_payload jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_save_workspace_impl(p_payload); $$;
create or replace function public.officeflow_delete_task(p_task_id text)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_delete_task_impl(p_task_id); $$;

revoke all on function public.officeflow_get_workspace() from public, anon;
revoke all on function public.officeflow_register_member(text,text,text) from public, anon;
revoke all on function public.officeflow_save_workspace(jsonb) from public, anon;
revoke all on function public.officeflow_delete_task(text) from public, anon;
grant execute on function public.officeflow_get_workspace() to authenticated;
grant execute on function public.officeflow_register_member(text,text,text) to authenticated;
grant execute on function public.officeflow_save_workspace(jsonb) to authenticated;
grant execute on function public.officeflow_delete_task(text) to authenticated;
