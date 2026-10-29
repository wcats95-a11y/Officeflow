-- Add optional phone numbers to shared workspace members and expose them through secure RPCs.
alter table public.officeflow_workspace_members
  add column if not exists phone_number text;

create or replace function officeflow_private.officeflow_get_workspace_with_phone_impl()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_result jsonb;
  v_owner uuid;
  v_members jsonb;
begin
  v_result := officeflow_private.officeflow_get_workspace_impl();
  if v_result->>'role' = 'manager' then
    v_owner := nullif(v_result->>'workspace_owner_id','')::uuid;
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'email', m.email,
        'display_name', m.display_name,
        'phone_number', m.phone_number,
        'role', m.role,
        'created_at', m.created_at
      ) order by m.created_at),
      '[]'::jsonb
    )
    into v_members
    from public.officeflow_workspace_members m
    where m.workspace_owner_id = v_owner;
    v_result := jsonb_set(v_result, '{members}', v_members, true);
  end if;
  return v_result;
end;
$function$;

create or replace function officeflow_private.officeflow_register_member_with_phone_impl(
  p_email text,
  p_role text,
  p_display_name text,
  p_phone_number text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_result jsonb;
  v_user_id uuid;
  v_phone text := nullif(trim(coalesce(p_phone_number,'')), '');
begin
  -- Reuse the existing implementation so all account, role, and workspace checks remain enforced.
  v_result := officeflow_private.officeflow_register_member_impl(p_email, p_role, p_display_name);
  v_user_id := nullif(v_result->>'user_id','')::uuid;
  if v_user_id is null then
    raise exception 'Workspace member registration did not return a user ID';
  end if;
  update public.officeflow_workspace_members
     set phone_number = v_phone,
         updated_at = now()
   where user_id = v_user_id;
  return v_result || jsonb_build_object('phone_number', v_phone);
end;
$function$;

revoke all on function officeflow_private.officeflow_get_workspace_with_phone_impl() from public, anon;
revoke all on function officeflow_private.officeflow_register_member_with_phone_impl(text,text,text,text) from public, anon;
grant execute on function officeflow_private.officeflow_get_workspace_with_phone_impl() to authenticated;
grant execute on function officeflow_private.officeflow_register_member_with_phone_impl(text,text,text,text) to authenticated;

create or replace function public.officeflow_get_workspace()
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_get_workspace_with_phone_impl(); $$;

create or replace function public.officeflow_register_member(
  p_email text,
  p_role text,
  p_display_name text,
  p_phone_number text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$ select officeflow_private.officeflow_register_member_with_phone_impl(p_email,p_role,p_display_name,p_phone_number); $$;

revoke all on function public.officeflow_get_workspace() from public, anon;
revoke all on function public.officeflow_register_member(text,text,text,text) from public, anon;
grant execute on function public.officeflow_get_workspace() to authenticated;
grant execute on function public.officeflow_register_member(text,text,text,text) to authenticated;
