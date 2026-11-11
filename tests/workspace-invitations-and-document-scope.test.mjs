import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const invitationMigration = readFileSync(new URL("../supabase/migrations/20261109031829_workspace_email_invitations.sql", import.meta.url), "utf8");
const documentScopeMigration = readFileSync(new URL("../supabase/migrations/20261109031832_officeflow_junior_matter_round_document_scope.sql", import.meta.url), "utf8");
const invitationFunction = readFileSync(new URL("../supabase/functions/workspace-invite/index.ts", import.meta.url), "utf8");
const acceptancePage = readFileSync(new URL("../app/accept-invitation/page.tsx", import.meta.url), "utf8");
const appPage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("workspace invitations are private and expire", () => {
  assert.match(invitationMigration, /officeflow_workspace_invitations/);
  assert.match(invitationMigration, /enable row level security/i);
  assert.match(invitationMigration, /officeflow_invitations_deny_direct_access/);
  assert.match(invitationMigration, /expires_at timestamptz not null/);
});

test("only the authenticated invited email can activate membership", () => {
  assert.match(invitationMigration, /officeflow_accept_invitation_impl/);
  assert.match(invitationMigration, /email_confirmed_at is not null/);
  assert.match(invitationMigration, /lower\(i\.email\)=v_email/);
  assert.match(invitationMigration, /insert into public\.officeflow_workspace_members/);
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

test("junior responses scope matter-round attachments to visible tasks", () => {
  assert.match(documentScopeMigration, /v_workspace->'payload'->'tasks'/);
  assert.match(documentScopeMigration, /roundId/);
  assert.match(documentScopeMigration, /matterId/);
  assert.match(documentScopeMigration, /payload,matterRounds/);
});

test("manager UI supports pending invitation resend and revocation", () => {
  assert.match(appPage, /officeflow_get_invitations/);
  assert.match(appPage, /resendWorkspaceInvitation/);
  assert.match(appPage, /revokeWorkspaceInvitation/);
  assert.match(appPage, /Pending invitations/);
});
