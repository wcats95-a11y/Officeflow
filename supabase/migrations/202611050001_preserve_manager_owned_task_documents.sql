-- Preserve task attachment and document-link fields from junior submissions.
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
    if v_found and (coalesce(v_old_task->>'createdByUserId','')=v_uid::text or exists(select 1 from jsonb_array_elements_text(coalesce(v_old_task->'juniors','[]'::jsonb)) assigned(name) where lower(trim(assigned.name))=lower(trim(v_display_name)))) then
      v_safe:=v_submitted-array['billingStatus','billingOwner','billingAmount','amountPaid','paymentStatus','filingAckDocument','uploadedDocuments','documentLinks','filingAck','lastFollowUpOutcome','juniors','preparer','reviewer','approvalStatus','createdByUserId','approvedBy','approvedAt','activity'];
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
      v_new_task:=v_safe||jsonb_build_object('id',v_task_id,'createdByUserId',v_uid::text,'approvalStatus','pending','status','To Do','juniors',jsonb_build_array(v_display_name),'preparer',v_display_name,'activity',jsonb_build_array(jsonb_build_object('at',now(),'actor',v_display_name,'message','Task submitted as draft; awaiting manager approval')));
      v_tasks:=v_tasks||jsonb_build_array(v_new_task);
      insert into public.officeflow_task_audit(workspace_owner_id,task_id,actor_user_id,action,changed_fields) values(v_owner,v_task_id,v_uid,'task_created_pending_approval',array['task','approvalStatus']);
    end if;
  end loop;
  v_next_payload:=jsonb_set(coalesce(v_existing,'{}'::jsonb),'{tasks}',v_tasks,true);
  update public.officeflow_workspace_state set payload=v_next_payload,schema_version=greatest(schema_version,1),updated_at=now() where owner_id=v_owner;
  return jsonb_build_object('ok',true,'role',v_role);
end;
$function$;


