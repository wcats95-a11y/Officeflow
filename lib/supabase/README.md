# OfficeFlow Supabase integration

The OfficeFlow Supabase project is configured through these Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The publishable key is safe for browser use only because the database has Row Level Security enabled. Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable.

`client.ts` provides the browser client. `repository.ts` provides owner-workspace initialization and task load/save helpers. These helpers require a verified Supabase Auth session and therefore do not bypass RLS while Google Sign-In is deferred.

The app should continue using local browser storage until authentication is enabled and cloud-sync UX is wired into the task screens. Before switching an existing local dataset to cloud storage, implement a reviewed one-time import with duplicate handling; do not silently overwrite local tasks.
