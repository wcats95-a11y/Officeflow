create or replace function officeflow_private.officeflow_update_member_impl(
  p_user_id uuid,
  p_display_name text,
  p_role text,
  p_phone_number text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_role text;
  v_target_owner uuid;
  v_name text := trim(coalesce(p_display_name, ''));
  v_member_role text := lower(trim(coalesce(p_role, '')));
  v_phone text := nullif(trim(coalesce(p_phone_number, '')), '');
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select m.workspace_owner_id, m.role into v_owner, v_role
    from public.officeflow_workspace_members m where m.user_id = v_uid limit 1;
  if v_owner is null then v_owner := v_uid; v_role := 'manager'; end if;
  if v_role <> 'manager' then raise exception 'Only managers can edit workspace members'; end if;
  if p_user_id is null or p_user_id = v_uid then raise exception 'Edit your own profile from Account settings'; end if;
  if v_name = '' then raise exception 'Display name is required'; end if;
  if v_member_role not in ('manager', 'junior') then raise exception 'Role must be manager or junior'; end if;
  select m.workspace_owner_id into v_target_owner from public.officeflow_workspace_members m where m.user_id = p_user_id for update;
  if v_target_owner is distinct from v_owner then raise exception 'Workspace member was not found'; end if;
  if v_member_role = 'junior' and exists (
    select 1 from public.officeflow_workspace_members m
    where m.workspace_owner_id = v_owner and m.user_id <> p_user_id and m.role = 'junior'
      and lower(trim(m.display_name)) = lower(v_name)
  ) then raise exception 'That junior name is already in use'; end if;
  update public.officeflow_workspace_members
    set display_name = v_name, role = v_member_role, phone_number = v_phone, updated_at = now()
    where user_id = p_user_id and workspace_owner_id = v_owner;
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function officeflow_private.officeflow_remove_member_impl(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_role text;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select m.workspace_owner_id, m.role into v_owner, v_role
    from public.officeflow_workspace_members m where m.user_id = v_uid limit 1;
  if v_owner is null then v_owner := v_uid; v_role := 'manager'; end if;
  if v_role <> 'manager' then raise exception 'Only managers can remove workspace members'; end if;
  if p_user_id is null or p_user_id = v_uid then raise exception 'You cannot remove your own workspace access'; end if;
  delete from public.officeflow_workspace_members where user_id = p_user_id and workspace_owner_id = v_owner;
  if not found then raise exception 'Workspace member was not found'; end if;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function officeflow_private.officeflow_update_member_impl(uuid,text,text,text) from public, anon;
revoke all on function officeflow_private.officeflow_remove_member_impl(uuid) from public, anon;
grant execute on function officeflow_private.officeflow_update_member_impl(uuid,text,text,text) to authenticated;
grant execute on function officeflow_private.officeflow_remove_member_impl(uuid) to authenticated;

create or replace function public.officeflow_update_member(p_user_id uuid, p_display_name text, p_role text, p_phone_number text)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_update_member_impl(p_user_id,p_display_name,p_role,p_phone_number); $$;
create or replace function public.officeflow_remove_member(p_user_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_remove_member_impl(p_user_id); $$;
revoke all on function public.officeflow_update_member(uuid,text,text,text) from public, anon;
revoke all on function public.officeflow_remove_member(uuid) from public, anon;
grant execute on function public.officeflow_update_member(uuid,text,text,text) to authenticated;
grant execute on function public.officeflow_remove_member(uuid) to authenticated;
