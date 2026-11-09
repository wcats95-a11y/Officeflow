-- Workspace email invitations: membership is granted only after the invited address authenticates and accepts.
create table if not exists public.officeflow_workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  phone_number text,
  role text not null check (role in ('manager','junior')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  last_sent_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  constraint officeflow_workspace_invitation_email_nonempty check (length(trim(email)) > 3)
);
create unique index if not exists officeflow_workspace_invitations_one_pending_email
  on public.officeflow_workspace_invitations (lower(email)) where status = 'pending';
create index if not exists officeflow_workspace_invitations_owner_created
  on public.officeflow_workspace_invitations (workspace_owner_id, created_at desc);
alter table public.officeflow_workspace_invitations enable row level security;
revoke all on public.officeflow_workspace_invitations from anon, authenticated;
drop policy if exists officeflow_invitations_deny_direct_access on public.officeflow_workspace_invitations;
create policy officeflow_invitations_deny_direct_access on public.officeflow_workspace_invitations
  for all to authenticated using (false) with check (false);

create or replace function officeflow_private.officeflow_create_invitation_impl(
  p_email text, p_role text, p_display_name text, p_phone_number text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_caller_role text; v_target_id uuid; v_target_email text;
  v_name text := trim(coalesce(p_display_name,'')); v_email text := lower(trim(coalesce(p_email,'')));
  v_invitation_id uuid; v_existing_pending_owner uuid; v_target_payload jsonb;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if v_email = '' or position('@' in v_email) < 2 then raise exception 'Enter a valid email address'; end if;
  if lower(coalesce(p_role,'')) not in ('manager','junior') then raise exception 'Role must be manager or junior'; end if;
  if v_name = '' then raise exception 'Display name is required'; end if;
  select m.workspace_owner_id,m.role into v_owner,v_caller_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_caller_role:='manager'; end if;
  if v_caller_role <> 'manager' then raise exception 'Only workspace managers can invite members'; end if;
  select u.id,u.email into v_target_id,v_target_email from auth.users u where lower(u.email)=v_email limit 1;
  if v_target_id = v_owner then raise exception 'The workspace owner already has access'; end if;
  if v_target_id is not null then
    if exists(select 1 from public.officeflow_workspace_members m where m.user_id=v_target_id and m.workspace_owner_id=v_owner) then
      raise exception 'This person is already a workspace member';
    end if;
    if exists(select 1 from public.officeflow_workspace_members m where m.user_id=v_target_id) then
      raise exception 'This account already belongs to another OfficeFlow workspace';
    end if;
    select s.payload into v_target_payload from public.officeflow_workspace_state s where s.owner_id=v_target_id;
    if v_target_payload is not null and (
      jsonb_array_length(coalesce(v_target_payload->'tasks','[]'::jsonb)) > 0
      or jsonb_array_length(coalesce(v_target_payload->'clientDirectory','[]'::jsonb)) > 0
    ) then raise exception 'This account already contains workspace data and cannot be moved automatically. Export and resolve that workspace before inviting.'; end if;
  end if;
  update public.officeflow_workspace_invitations set status='expired',updated_at=now()
    where lower(email)=v_email and status='pending' and expires_at<=now();
  select i.workspace_owner_id into v_existing_pending_owner from public.officeflow_workspace_invitations i
    where lower(i.email)=v_email and i.status='pending' and i.expires_at>now() limit 1 for update;
  if v_existing_pending_owner is not null and v_existing_pending_owner <> v_owner then
    raise exception 'This email already has a pending invitation to another workspace';
  end if;
  insert into public.officeflow_workspace_invitations(workspace_owner_id,email,display_name,phone_number,role,invited_by,status,expires_at,updated_at)
  values(v_owner,v_email,v_name,nullif(trim(coalesce(p_phone_number,'')),''),lower(p_role),v_uid,'pending',now()+interval '7 days',now())
  on conflict (lower(email)) where status='pending'
  do update set display_name=excluded.display_name,phone_number=excluded.phone_number,role=excluded.role,
    invited_by=excluded.invited_by,expires_at=excluded.expires_at,updated_at=now()
  where officeflow_workspace_invitations.workspace_owner_id=excluded.workspace_owner_id
  returning id into v_invitation_id;
  if v_invitation_id is null then raise exception 'A pending invitation for this email already exists in another workspace'; end if;
  return jsonb_build_object('invitation_id',v_invitation_id,'email',v_email,'is_existing_user',v_target_id is not null);
end;
$function$;

create or replace function officeflow_private.officeflow_mark_invitation_sent_impl(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth
as $function$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_role text;
begin
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_uid is null or v_role<>'manager' then raise exception 'Only managers can manage invitations'; end if;
  update public.officeflow_workspace_invitations set last_sent_at=now(),updated_at=now()
    where id=p_invitation_id and workspace_owner_id=v_owner and status='pending' and expires_at>now();
  if not found then raise exception 'Pending invitation was not found'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function officeflow_private.officeflow_fail_invitation_impl(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth
as $function$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_role text;
begin
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_uid is null or v_role<>'manager' then raise exception 'Only managers can manage invitations'; end if;
  update public.officeflow_workspace_invitations set status='failed',updated_at=now()
    where id=p_invitation_id and workspace_owner_id=v_owner and status='pending';
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function officeflow_private.officeflow_get_invitations_impl()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth
as $function$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_role text; v_result jsonb;
begin
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_uid is null or v_role<>'manager' then raise exception 'Only managers can view invitations'; end if;
  update public.officeflow_workspace_invitations set status='expired',updated_at=now()
    where workspace_owner_id=v_owner and status='pending' and expires_at<=now();
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'display_name',i.display_name,
    'phone_number',i.phone_number,'role',i.role,'status',i.status,'created_at',i.created_at,
    'expires_at',i.expires_at,'last_sent_at',i.last_sent_at) order by i.created_at desc),'[]'::jsonb)
  into v_result from public.officeflow_workspace_invitations i
  where i.workspace_owner_id=v_owner and i.created_at>now()-interval '90 days';
  return v_result;
end;
$function$;

create or replace function officeflow_private.officeflow_revoke_invitation_impl(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth
as $function$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_role text;
begin
  select m.workspace_owner_id,m.role into v_owner,v_role from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_owner is null then v_owner:=v_uid; v_role:='manager'; end if;
  if v_uid is null or v_role<>'manager' then raise exception 'Only managers can revoke invitations'; end if;
  update public.officeflow_workspace_invitations set status='revoked',updated_at=now()
    where id=p_invitation_id and workspace_owner_id=v_owner and status='pending';
  if not found then raise exception 'Pending invitation was not found'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function officeflow_private.officeflow_accept_invitation_impl()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth
as $function$
declare
  v_uid uuid:=auth.uid(); v_email text; v_invitation public.officeflow_workspace_invitations%rowtype;
  v_existing_owner uuid; v_payload jsonb;
begin
  if v_uid is null then raise exception 'Sign in with the invited email address first'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=v_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify the invited email address before accepting'; end if;
  select * into v_invitation from public.officeflow_workspace_invitations i
    where lower(i.email)=v_email and i.status='pending' and i.expires_at>now()
    order by i.created_at desc limit 1 for update;
  if not found then raise exception 'No valid pending invitation was found for this signed-in email'; end if;
  if v_uid=v_invitation.workspace_owner_id then raise exception 'The workspace owner cannot accept their own invitation'; end if;
  select m.workspace_owner_id into v_existing_owner from public.officeflow_workspace_members m where m.user_id=v_uid limit 1;
  if v_existing_owner is not null and v_existing_owner<>v_invitation.workspace_owner_id then
    raise exception 'This account already belongs to another OfficeFlow workspace';
  end if;
  select s.payload into v_payload from public.officeflow_workspace_state s where s.owner_id=v_uid;
  if v_existing_owner is null and v_payload is not null and (
    jsonb_array_length(coalesce(v_payload->'tasks','[]'::jsonb))>0
    or jsonb_array_length(coalesce(v_payload->'clientDirectory','[]'::jsonb))>0
  ) then raise exception 'This account already contains workspace data. It cannot be moved automatically.'; end if;
  insert into public.officeflow_workspace_members(workspace_owner_id,user_id,email,display_name,role,invited_by,phone_number,updated_at)
  values(v_invitation.workspace_owner_id,v_uid,v_email,v_invitation.display_name,v_invitation.role,v_invitation.invited_by,v_invitation.phone_number,now())
  on conflict(workspace_owner_id,user_id) do update set email=excluded.email,display_name=excluded.display_name,
    role=excluded.role,phone_number=excluded.phone_number,updated_at=now();
  update public.officeflow_workspace_invitations set status='accepted',accepted_by=v_uid,accepted_at=now(),updated_at=now()
    where id=v_invitation.id;
  return jsonb_build_object('ok',true,'workspace_owner_id',v_invitation.workspace_owner_id,'role',v_invitation.role);
end;
$function$;

create or replace function public.officeflow_create_invitation(p_email text,p_role text,p_display_name text,p_phone_number text)
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$ select officeflow_private.officeflow_create_invitation_impl(p_email,p_role,p_display_name,p_phone_number); $$;
create or replace function public.officeflow_mark_invitation_sent(p_invitation_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$ select officeflow_private.officeflow_mark_invitation_sent_impl(p_invitation_id); $$;
create or replace function public.officeflow_fail_invitation(p_invitation_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$ select officeflow_private.officeflow_fail_invitation_impl(p_invitation_id); $$;
create or replace function public.officeflow_get_invitations()
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$ select officeflow_private.officeflow_get_invitations_impl(); $$;
create or replace function public.officeflow_revoke_invitation(p_invitation_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$ select officeflow_private.officeflow_revoke_invitation_impl(p_invitation_id); $$;
create or replace function public.officeflow_accept_invitation()
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$ select officeflow_private.officeflow_accept_invitation_impl(); $$;

revoke all on function public.officeflow_create_invitation(text,text,text,text) from public,anon;
revoke all on function public.officeflow_mark_invitation_sent(uuid) from public,anon;
revoke all on function public.officeflow_fail_invitation(uuid) from public,anon;
revoke all on function public.officeflow_get_invitations() from public,anon;
revoke all on function public.officeflow_revoke_invitation(uuid) from public,anon;
revoke all on function public.officeflow_accept_invitation() from public,anon;
grant execute on function public.officeflow_create_invitation(text,text,text,text) to authenticated;
grant execute on function public.officeflow_mark_invitation_sent(uuid) to authenticated;
grant execute on function public.officeflow_fail_invitation(uuid) to authenticated;
grant execute on function public.officeflow_get_invitations() to authenticated;
grant execute on function public.officeflow_revoke_invitation(uuid) to authenticated;
grant execute on function public.officeflow_accept_invitation() to authenticated;
