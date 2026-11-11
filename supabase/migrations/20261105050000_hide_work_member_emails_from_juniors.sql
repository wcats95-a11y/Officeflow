CREATE OR REPLACE FUNCTION public.officeflow_get_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_workspace jsonb;
BEGIN
  v_workspace := officeflow_private.officeflow_get_workspace_with_phone_impl();

  IF v_workspace->>'role' = 'junior' THEN
    v_workspace := jsonb_set(
      v_workspace,
      '{payload,workMemberEmails}',
      '{}'::jsonb,
      true
    );
  END IF;

  RETURN v_workspace;
END;
$function$;

REVOKE ALL ON FUNCTION public.officeflow_get_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.officeflow_get_workspace() TO authenticated;
