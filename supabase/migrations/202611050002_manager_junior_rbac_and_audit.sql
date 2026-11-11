-- Manager/Junior RBAC hardening: use member IDs, constrain junior edits, neutralize member lookup errors, and expose the private audit log to managers only.
-- Convert legacy display-name task assignments to stable account IDs when names match one member uniquely.
with migrated as (
  select s.owner_id,
    jsonb_agg(
      case when jsonb_typeof(t.task)='object' then
        jsonb_set(
          jsonb_set(t.task,'{juniorUserIds}',coalesce((
            select jsonb_agg(m.user_id::text order by m.user_id)
            from public.officeflow_workspace_members m
            where m.workspace_owner_id=s.owner_id and m.role='junior'
              and exists(select 1 from jsonb_array_elements_text(coalesce(t.task->'juniors','[]'::jsonb)) a(name) where lower(trim(a.name))=lower(trim(m.display_name)))
              and (select count(*) from public.officeflow_workspace_members m2 where m2.workspace_owner_id=s.owner_id and m2.role='junior' and lower(trim(m2.display_name))=lower(trim(m.display_name)))=1
          ),'[]'::jsonb),true),
          '{preparerUserId}',coalesce((
            select to_jsonb(m.user_id::text) from public.officeflow_workspace_members m
            where m.workspace_owner_id=s.owner_id and m.role='junior' and lower(trim(m.display_name))=lower(trim(t.task->>'preparer'))
              and (select count(*) from public.officeflow_workspace_members m2 where m2.workspace_owner_id=s.owner_id and m2.role='junior' and lower(trim(m2.display_name))=lower(trim(m.display_name)))=1
            limit 1
          ),'null'::jsonb),true)
      else t.task end order by t.ordinality) as tasks
  from public.officeflow_workspace_state s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'tasks','[]'::jsonb)) with ordinality t(task,ordinality)
  group by s.owner_id
)
update public.officeflow_workspace_state s
set payload=jsonb_set(s.payload,'{tasks}',m.tasks,true)
from migrated m where m.owner_id=s.owner_id;
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
  if v_role='manager' then
    update public.officeflow_workspace_state s
    set payload=jsonb_set(s.payload,'{tasks}',coalesce((
      select jsonb_agg(t.task order by t.ordinality)
      from jsonb_array_elements(coalesce(s.payload->'tasks','[]'::jsonb)) with ordinality t(task,ordinality)
      where nullif(t.task->>'deletedAt','') is null or (t.task->>'deletedAt')::timestamptz>=now()-interval '30 days'
    ),'[]'::jsonb),true),updated_at=now()
    where s.owner_id=v_owner and exists(select 1 from jsonb_array_elements(coalesce(s.payload->'tasks','[]'::jsonb)) t(task) where nullif(t.task->>'deletedAt','') is not null and (t.task->>'deletedAt')::timestamptz<now()-interval '30 days');
  end if;
  select s.payload into v_payload from public.officeflow_workspace_state s where s.owner_id=v_owner;
  if v_role='manager' then
    select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',m.email,'display_name',m.display_name,'role',m.role,'created_at',m.created_at) order by m.created_at),'[]'::jsonb)
      into v_members from public.officeflow_workspace_members m where m.workspace_owner_id=v_owner;
    return jsonb_build_object('payload',coalesce(v_payload,'{}'::jsonb),'role',v_role,'display_name',v_display_name,'workspace_owner_id',v_owner,'members',v_members,'email',coalesce(v_email,''));
  end if;
  select coalesce(jsonb_agg((t.task - array['billingStatus','billingOwner','billingAmount','amountPaid','paymentStatus','filingAckDocument','filingAck','lastFollowUpOutcome']) order by t.ordinality),'[]'::jsonb)
    into v_visible_tasks
    from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) with ordinality as t(task,ordinality)
    where coalesce(t.task->>'createdByUserId','')=v_uid::text
       or t.task->>'preparerUserId'=v_uid::text or exists(select 1 from jsonb_array_elements_text(coalesce(t.task->'juniorUserIds','[]'::jsonb)) assigned(user_id) where assigned.user_id=v_uid::text);
  v_payload := jsonb_set(coalesce(v_payload,'{}'::jsonb),'{tasks}',v_visible_tasks,true);
  v_payload := jsonb_set(v_payload,'{clientDirectory}','[]'::jsonb,true);
  v_payload := jsonb_set(v_payload,'{juniorDirectory}','{}'::jsonb,true);
  v_payload := jsonb_set(v_payload,'{auditLog}','[]'::jsonb,true);
  return jsonb_build_object('payload',v_payload,'role',v_role,'display_name',v_display_name,'workspace_owner_id',v_owner,'members','[]'::jsonb,'email',coalesce(v_email,''));
end;
$function$;

CREATE OR REPLACE FUNCTION officeflow_private.officeflow_save_workspace_impl(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_role text; v_display_name text; v_existing jsonb; v_next_payload jsonb;
  v_old_task jsonb; v_submitted jsonb; v_safe jsonb; v_updated jsonb; v_new_task jsonb;
  v_tasks jsonb := '[]'::jsonb; v_changed text[]; v_task_id text; v_found boolean; v_keep_existing boolean; v_existing_activity_at text; v_submitted_activity_at text; v_key text; v_value jsonb;
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
      if coalesce(v_old_task->>'status','To Do') not in ('Filed / completed','Done','Closed')
         and coalesce(v_updated->>'status','To Do') in ('Filed / completed','Done','Closed')
         and not (jsonb_typeof(v_updated->'filingAckDocument')='object'
           and coalesce(nullif(v_updated->'filingAckDocument'->>'dataUrl',''),nullif(v_updated->'filingAckDocument'->>'url','')) is not null) then
        raise exception 'Upload the filing acknowledgement before closing this task';
      end if;
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
        if coalesce(v_submitted->>'status','To Do') in ('Filed / completed','Done','Closed')
           and not (jsonb_typeof(v_submitted->'filingAckDocument')='object'
             and coalesce(nullif(v_submitted->'filingAckDocument'->>'dataUrl',''),nullif(v_submitted->'filingAckDocument'->>'url','')) is not null) then
          raise exception 'Upload the filing acknowledgement before closing this task';
        end if;
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
    if v_found and (coalesce(v_old_task->>'createdByUserId','')=v_uid::text or v_old_task->>'preparerUserId'=v_uid::text or exists(select 1 from jsonb_array_elements_text(coalesce(v_old_task->'juniorUserIds','[]'::jsonb)) assigned(user_id) where assigned.user_id=v_uid::text)) then
      v_safe:='{}'::jsonb;
      for v_key,v_value in select key,value from jsonb_each(v_submitted) loop
        if v_key=any(array['status','checklist','notes','lastProgressUpdate']) then
          if v_key='status' and (v_value#>>'{}') not in ('To Do','In Progress','Waiting for client','Waiting for documents','Ready for review','Rework required','On hold','Partially replied','Fully replied') then
            raise exception 'A manager must approve or close this task';
          end if;
          v_safe:=v_safe||jsonb_build_object(v_key,v_value);
        end if;
      end loop;
      select coalesce(array_agg(e.key order by e.key),'{}'::text[]) into v_changed from jsonb_each(v_safe) e where v_old_task->e.key is distinct from e.value;
      v_updated:=v_old_task||v_safe;
      if coalesce(v_old_task->>'status','To Do') not in ('Filed / completed','Done','Closed')
         and coalesce(v_updated->>'status','To Do') in ('Filed / completed','Done','Closed')
         and not (jsonb_typeof(v_updated->'filingAckDocument')='object'
           and coalesce(nullif(v_updated->'filingAckDocument'->>'dataUrl',''),nullif(v_updated->'filingAckDocument'->>'url','')) is not null) then
        raise exception 'Upload the filing acknowledgement before closing this task';
      end if;
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
      v_new_task:=v_safe||jsonb_build_object('id',v_task_id,'createdByUserId',v_uid::text,'approvalStatus','pending','status','To Do','juniors',jsonb_build_array(v_display_name),'preparer',v_display_name,'preparerUserId',v_uid::text,'juniorUserIds',jsonb_build_array(v_uid::text),'activity',jsonb_build_array(jsonb_build_object('at',now(),'actor',v_display_name,'message','Task submitted as draft; awaiting manager approval')));
      v_tasks:=v_tasks||jsonb_build_array(v_new_task);
      insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields) values(v_owner,v_task_id,v_uid,'task_created_pending_approval',array['task','approvalStatus']);
    end if;
  end loop;
  v_next_payload:=jsonb_set(coalesce(v_existing,'{}'::jsonb),'{tasks}',v_tasks,true);
  update public.officeflow_workspace_state set payload=v_next_payload,schema_version=greatest(schema_version,1),updated_at=now() where owner_id=v_owner;
  return jsonb_build_object('ok',true,'role',v_role);
end;
$function$;

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
  if v_target_id is null then raise exception 'Unable to grant access. Ask the team member to check their account and contact you.'; end if;
  if v_target_id=v_owner then raise exception 'The workspace owner already has manager access'; end if;
  if exists(select 1 from public.officeflow_workspace_members m where m.user_id=v_target_id and m.workspace_owner_id<>v_owner) then
    raise exception 'Unable to grant access. Ask the team member to check their account and contact you.';
  end if;
  select s.payload into v_target_payload from public.officeflow_workspace_state s where s.owner_id=v_target_id;
  if v_target_id<>v_owner and (
    jsonb_array_length(coalesce(v_target_payload->'tasks','[]'::jsonb))>0
    or jsonb_array_length(coalesce(v_target_payload->'clientDirectory','[]'::jsonb))>0
  ) then
    raise exception 'Unable to grant access. Ask the team member to check their account and contact you.';
  end if;
  v_name:=trim(p_display_name);
  if exists(select 1 from public.officeflow_workspace_members m where m.workspace_owner_id=v_owner and m.role='junior' and lower(trim(m.display_name))=lower(v_name)) then raise exception 'That junior name is already in use. Enter a unique name.'; end if;
  insert into public.officeflow_workspace_members(workspace_owner_id,user_id,email,display_name,role,invited_by,updated_at)
  values(v_owner,v_target_id,coalesce(v_target_email,lower(trim(p_email))),v_name,lower(p_role),v_uid,now())
  on conflict(workspace_owner_id,user_id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,invited_by=excluded.invited_by,updated_at=now();
  return jsonb_build_object('user_id',v_target_id,'email',coalesce(v_target_email,lower(trim(p_email))),'display_name',v_name,'role',lower(p_role));
end;
$function$
;

CREATE OR REPLACE FUNCTION officeflow_private.officeflow_get_task_audit_impl(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','auth'
AS $function$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_role text; v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_role<>'manager' then raise exception 'Only managers can view the audit history'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'task_id',a.task_id,'actor_user_id',a.actor_user_id,'actor',coalesce(m.display_name,u.email,'Workspace member'),'action',a.action,'changed_fields',a.changed_fields,'created_at',a.created_at) order by a.created_at desc),'[]'::jsonb)
    into v_rows from (select * from public.officeflow_task_audit where workspace_owner_id=v_owner order by created_at desc limit greatest(1,least(coalesce(p_limit,200),500))) a
    left join public.officeflow_workspace_members m on m.workspace_owner_id=v_owner and m.user_id=a.actor_user_id
    left join auth.users u on u.id=a.actor_user_id;
  return v_rows;
end;
$function$;
revoke all on function officeflow_private.officeflow_get_task_audit_impl(integer) from public,anon;
grant execute on function officeflow_private.officeflow_get_task_audit_impl(integer) to authenticated;
create or replace function public.officeflow_get_task_audit(p_limit integer DEFAULT 200) returns jsonb language sql security invoker set search_path=pg_catalog,public as $$ select officeflow_private.officeflow_get_task_audit_impl(p_limit); $$;
revoke all on function public.officeflow_get_task_audit(integer) from public,anon;
grant execute on function public.officeflow_get_task_audit(integer) to authenticated;




