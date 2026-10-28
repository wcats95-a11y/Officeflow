# OfficeFlow

OfficeFlow is a responsive task and delegation workspace tailored toward CA office and direct-tax operations.

## Current features
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
This is still a single-browser prototype. Data is stored in the browser's localStorage, not in a shared database. Google sign-in is intentionally deferred. The dedicated Supabase database and secure load/save helpers are prepared, but app-level cloud sync and cross-device sharing remain disabled until authentication and the sync/import experience are completed. There are no scheduled reminders, official WhatsApp Business Platform integration, or WhatsApp delivery/read/reply tracking. Browser storage may be cleared or evicted; export a backup regularly. Do not enter confidential client documents, PANs, Aadhaar numbers, bank details or sensitive tax workpapers.

The manager dashboard counts are derived from tasks currently stored in this browser. They are not a substitute for an independently maintained statutory deadline register. Verify statutory dates against authoritative sources and maintain a separate reliable deadline control until reminders and cloud persistence are implemented and tested.
