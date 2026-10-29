import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = Boolean(url && key);

// Keep one browser client with an explicitly persistent session so auth survives refreshes.
export const supabase = cloudConfigured
  ? createClient(url as string, key as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "officeflow-supabase-auth",
      },
    })
  : null;
