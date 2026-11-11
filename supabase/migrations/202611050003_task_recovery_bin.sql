CREATE OR REPLACE FUNCTION officeflow_private.officeflow_delete_task_impl(p_task_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','auth'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_owner uuid; v_role text; v_payload jsonb; v_tasks jsonb; v_exists boolean; v_deleted boolean; v_deleted_at timestamptz:=now();
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_role<>'manager' then raise exception 'Only managers can delete tasks'; end if;
  select s.payload into v_payload from public.officeflow_workspace_state s where s.owner_id=v_owner for update;
  if v_payload is null then raise exception 'Workspace not found'; end if;
  select exists(select 1 from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) t(value) where t.value->>'id'=p_task_id) into v_exists;
  if not v_exists then return jsonb_build_object('ok',true,'deleted',false); end if;
  select exists(select 1 from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) t(value) where t.value->>'id'=p_task_id and nullif(t.value->>'deletedAt','') is not null) into v_deleted;
  if v_deleted then return jsonb_build_object('ok',true,'deleted',false,'already_deleted',true); end if;
  select coalesce(jsonb_agg(case when t.value->>'id'=p_task_id then jsonb_set(t.value,'{deletedAt}',to_jsonb(v_deleted_at),true) else t.value end order by t.ordinality),'[]'::jsonb)
    into v_tasks from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) with ordinality t(value,ordinality);
  update public.officeflow_workspace_state set payload=jsonb_set(v_payload,'{tasks}',v_tasks,true),updated_at=now() where owner_id=v_owner;
  insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields)
    values(v_owner,p_task_id,v_uid,'task_soft_deleted',array['deletedAt']);
  return jsonb_build_object('ok',true,'deleted',true,'deleted_at',v_deleted_at,'recover_until',v_deleted_at+interval '30 days');
end;
$function$;

CREATE OR REPLACE FUNCTION officeflow_private.officeflow_restore_task_impl(p_task_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','auth'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_owner uuid; v_role text; v_payload jsonb; v_tasks jsonb; v_task jsonb; v_deleted_at timestamptz;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_role<>'manager' then raise exception 'Only managers can restore tasks'; end if;
  select s.payload into v_payload from public.officeflow_workspace_state s where s.owner_id=v_owner for update;
  if v_payload is null then raise exception 'Workspace not found'; end if;
  select t.value into v_task from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) t(value) where t.value->>'id'=p_task_id limit 1;
  if v_task is null or nullif(v_task->>'deletedAt','') is null then return jsonb_build_object('ok',true,'restored',false); end if;
  v_deleted_at:=(v_task->>'deletedAt')::timestamptz;
  if v_deleted_at<now()-interval '30 days' then raise exception 'This task is outside the 30-day recovery period'; end if;
  select coalesce(jsonb_agg(case when t.value->>'id'=p_task_id then t.value-'deletedAt' else t.value end order by t.ordinality),'[]'::jsonb)
    into v_tasks from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) with ordinality t(value,ordinality);
  update public.officeflow_workspace_state set payload=jsonb_set(v_payload,'{tasks}',v_tasks,true),updated_at=now() where owner_id=v_owner;
  insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields)
    values(v_owner,p_task_id,v_uid,'task_restored',array['deletedAt']);
  return jsonb_build_object('ok',true,'restored',true);
end;
$function$;

revoke all on function officeflow_private.officeflow_restore_task_impl(text) from public,anon;
grant execute on function officeflow_private.officeflow_restore_task_impl(text) to authenticated;
create or replace function public.officeflow_restore_task(p_task_id text) returns jsonb language sql security invoker set search_path=pg_catalog,public as $$ select officeflow_private.officeflow_restore_task_impl(p_task_id); $$;
revoke all on function public.officeflow_restore_task(text) from public,anon;
grant execute on function public.officeflow_restore_task(text) to authenticated;

