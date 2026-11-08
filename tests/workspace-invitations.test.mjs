import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261108000100_workspace_email_invitations.sql", import.meta.url), "utf8");
const invitationFunction = readFileSync(new URL("../supabase/functions/workspace-invite/index.ts", import.meta.url), "utf8");
const acceptancePage = readFileSync(new URL("../app/accept-invitation/page.tsx", import.meta.url), "utf8");
const appPage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("workspace invitation records are private and expire", () => {
  assert.match(migration, /officeflow_workspace_invitations/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /officeflow_invitations_deny_direct_access/);
  assert.match(migration, /expires_at timestamptz not null/);
});

test("only the authenticated invited email can activate membership", () => {
  assert.match(migration, /officeflow_accept_invitation_impl/);
  assert.match(migration, /email_confirmed_at is not null/);
  assert.match(migration, /lower\(i\.email\)=v_email/);
  assert.match(migration, /insert into public\.officeflow_workspace_members/);
  assert.match(migration, /Direct member registration is disabled/);
});

test("invitation email uses a server-side privileged client only", () => {
  assert.match(invitationFunction, /auth\.admin\.inviteUserByEmail/);
  assert.match(invitationFunction, /shouldCreateUser: false/);
  assert.match(invitationFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(appPage, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
});

test("acceptance route verifies a signed-in session before accepting", () => {
  assert.match(acceptancePage, /auth\.getSession/);
  assert.match(acceptancePage, /officeflow_accept_invitation/);
});
