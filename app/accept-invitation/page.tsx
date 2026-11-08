"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabaseClient";

export default function AcceptInvitationPage() {
  const router = useRouter();
  const accepting = useRef(false);
  const [message, setMessage] = useState("Verifying your invitation…");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      setErrorMessage("OfficeFlow sign-in is not configured on this deployment.");
      return;
    }
    let alive = true;
    const accept = async (session: { user?: { email?: string | null } } | null) => {
      if (!alive || !session?.user || accepting.current) return;
      accepting.current = true;
      setMessage("Confirming your workspace access…");
      const { data, error } = await supabase!.rpc("officeflow_accept_invitation");
      if (!alive) return;
      if (error || !(data as any)?.ok) {
        accepting.current = false;
        setErrorMessage(error?.message || "This invitation could not be accepted. Ask the workspace manager to send a new invitation.");
        return;
      }
      setMessage("Invitation accepted. Opening your OfficeFlow workspace…");
      router.replace("/");
      router.refresh();
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void accept(data.session);
      else if (alive) setErrorMessage("The invitation link could not sign you in. Open the email link again or ask the manager to resend the invitation.");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void accept(session);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f3f8f7" }}>
      <section style={{ width: "min(100%, 440px)", padding: 32, borderRadius: 20, background: "#fff", boxShadow: "0 18px 50px rgba(15, 70, 65, .10)", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, margin: "0 auto 18px", display: "grid", placeItems: "center", borderRadius: 16, background: "#d9f2ec", color: "#0f766e", fontSize: 25, fontWeight: 800 }}>O</div>
        <h1 style={{ margin: "0 0 10px", color: "#153b38", fontSize: 24 }}>Join your OfficeFlow workspace</h1>
        <p style={{ margin: 0, color: "#5e7471", lineHeight: 1.6 }}>{message}</p>
        {errorMessage && <p role="alert" style={{ marginTop: 18, color: "#b42318", lineHeight: 1.5 }}>{errorMessage}</p>}
        {errorMessage && <a href="/" style={{ display: "inline-block", marginTop: 16, color: "#0f766e", fontWeight: 700 }}>Return to OfficeFlow</a>}
      </section>
    </main>
  );
}
