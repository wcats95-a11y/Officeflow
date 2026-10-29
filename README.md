# OfficeFlow

OfficeFlow is a responsive task and delegation workspace tailored toward CA office and direct-tax operations.

## Current features
- Supabase email/password authentication and owner-scoped workspace-state sync when the configured Supabase project is available
- Simple Junior workload tab with Income Tax-only assigned/open/overdue/review metrics and a direct filtered task view
- Income Tax-only monthly calendar with separate statutory, internal and notice-response deadline colours
- Calendar deadline status defaults to verification required unless explicitly supported by the schedule
- Task overview, search, status and priority filters, Kanban columns
- Create and edit tasks, update status, complete/reopen tasks
- CA workflow metadata: financial year, assessment year, task type, preparer, reviewer and handover notes
- Statuses for To Do, In Progress, Waiting for client, Waiting for documents, Under Review, On hold and Done
- Manager-oriented dashboard metrics: overdue tasks, due today, awaiting review and waiting on client/documents
- Client/project associations and junior assignment
- WhatsApp follow-up draft with client/FY/AY context; phone numbers can be saved in Settings
- Keyboard shortcuts: Ctrl/Cmd+K focuses search; Ctrl/Cmd+N opens a new task
- Light/dark theme
- Settings page with junior phone directory and JSON backup export/restore
- Browser-local persistence and India-local date calculation
- Supabase project configured with secure browser client and owner-scoped task repository (cloud sync activation awaits the final sign-in phase)

## Run locally
- Install Node.js 20+
- Run `npm install`
- Run `npm run dev`
- Open http://localhost:3000

## Important limitations
- Supabase sync stores a user's OfficeFlow workspace in the owner-scoped `officeflow_workspace_state` payload. This supports the same account across devices; it does not yet provide multi-user firm workspaces, membership/invitation flows, or role-based permissions.
- Browser localStorage remains a local cache and may be cleared or evicted. Export a backup regularly and test restore before relying on it.
- Reminder alerts are browser-local and depend on browser permission and OfficeFlow running. Server-side scheduled email/escalation reminders are not yet configured.
- Uploaded notice documents may be stored as browser data URLs within task state; private Supabase Storage upload, retention controls, and secure document-sharing workflows are not yet implemented. Do not upload highly sensitive client documents or workpapers until that is completed.
- WhatsApp actions open a prefilled message; there is no official WhatsApp Business Platform integration or delivery/read/reply tracking.
- Income Tax statutory dates are a baseline, not a complete verified official register. Verify taxpayer applicability, current notifications, and extensions against authoritative sources before relying on a date. The calendar intentionally marks standard dates as needing verification unless specifically confirmed.
- Dashboard metrics depend on the data entered and on the task's tax-type classification. Explicitly set task type and review deadline fields; do not rely solely on keyword classification for legal matters.
