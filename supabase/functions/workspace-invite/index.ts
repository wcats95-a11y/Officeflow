import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function keyFromJsonEnv(name: string): string | null {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : (parsed.default ?? Object.values(parsed)[0] ?? null);
  } catch {
    return raw;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? keyFromJsonEnv("SUPABASE_PUBLISHABLE_KEYS");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? keyFromJsonEnv("SUPABASE_SECRET_KEYS");
    const authorization = req.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
      return new Response(JSON.stringify({ error: "Invitation service is not configured." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sign in as a workspace manager to send invitations." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "").trim().toLowerCase();
    const displayName = String(body.display_name ?? "").trim();
    const phoneNumber = String(body.phone_number ?? "").trim();
    if (!email || !displayName || !["manager", "junior"].includes(role)) {
      return new Response(JSON.stringify({ error: "Email, display name and a valid workspace role are required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: invitation, error: createError } = await userClient.rpc("officeflow_create_invitation", {
      p_email: email, p_role: role, p_display_name: displayName, p_phone_number: phoneNumber,
    });
    if (createError) throw createError;
    const invitationId = invitation?.invitation_id;
    if (!invitationId) throw new Error("The invitation record could not be created.");
    const appUrl = (Deno.env.get("OFFICEFLOW_APP_URL") ?? "https://mcaworktracker.vercel.app").replace(/\/$/, "");
    const redirectTo = `${appUrl}/accept-invitation`;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let mailError: { message?: string } | null = null;
    if (invitation.is_existing_user) {
      const publicClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await publicClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      mailError = error;
    } else {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo, data: { display_name: displayName, workspace_role: role, invitation_id: invitationId },
      });
      mailError = error;
    }
    if (mailError) {
      await userClient.rpc("officeflow_fail_invitation", { p_invitation_id: invitationId });
      return new Response(JSON.stringify({ error: mailError.message || "The invitation email could not be sent." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { error: sentError } = await userClient.rpc("officeflow_mark_invitation_sent", { p_invitation_id: invitationId });
    if (sentError) throw sentError;
    return new Response(JSON.stringify({
      ok: true, invitation_id: invitationId,
      message: `Invitation email sent to ${email}. Workspace access will be activated only after acceptance.`,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send the workspace invitation.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
