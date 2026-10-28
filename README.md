# OfficeFlow

OfficeFlow is a responsive task and delegation workspace built with Next.js, TypeScript and React.

## Run locally
- Install Node.js 20+
- Run `npm install`
- Run `npm run dev`
- Open http://localhost:3000

## Current implementation
- Task overview, task search, status and priority filters, Kanban columns
- Create tasks with category, project, client, due date and multiple junior names
- Update task status, task completion and dashboard metrics
- Prepare WhatsApp messages for manual review and sending
- Light/dark theme and responsive desktop/mobile layout
- Local browser storage for tasks and theme

## Important limitations
This first UI release stores data in the current browser only. It does not yet include Google sign-in, Supabase database sync, cross-device sharing, offline conflict resolution, scheduled reminders, or WhatsApp delivery tracking. WhatsApp opens a prefilled draft for the user to review and send manually. Do not enter confidential client documents or sensitive data into this prototype.


Deployment note: Vercel project framework is configured for Next.js.
