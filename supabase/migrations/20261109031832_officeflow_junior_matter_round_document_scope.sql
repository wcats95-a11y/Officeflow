create or replace function public.officeflow_get_workspace()
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_workspace jsonb;
  v_visible_rounds jsonb;
begin
  v_workspace := officeflow_private.officeflow_get_workspace_with_phone_impl();

  if v_workspace->>'role' = 'junior' then
    v_workspace := jsonb_set(v_workspace, '{payload,workMemberEmails}', '{}'::jsonb, true);

    select coalesce(jsonb_agg(r.value order by r.ordinality), '[]'::jsonb)
      into v_visible_rounds
    from jsonb_array_elements(coalesce(v_workspace->'payload'->'matterRounds', '[]'::jsonb))
      with ordinality as r(value, ordinality)
    where exists (
      select 1
      from jsonb_array_elements(coalesce(v_workspace->'payload'->'tasks', '[]'::jsonb)) as t(value)
      where nullif(t.value->>'roundId', '') = nullif(r.value->>'id', '')
         or nullif(r.value->>'matterId', '') =
            coalesce(nullif(t.value->>'client', ''), 'client') || '::' ||
            coalesce(nullif(t.value->>'matterName', ''), nullif(t.value->>'id', ''))
    );

    v_workspace := jsonb_set(v_workspace, '{payload,matterRounds}', v_visible_rounds, true);
  end if;

  return v_workspace;
end;
$function$;
