# Application Tracking and Customer Care

Vendor and merchant accounts receive a database-generated `SKO-APP-YYYY-NNNNNNNN` reference. It is unique and stable across retries, profile edits and review decisions. Existing partner accounts receive references during migration. Application status comes from the existing compliance record; no financial/provider approval checks are bypassed. A tracking number may exist while an application still needs details.

Both web and mobile display the reference with an approval-request email link to support@sokoeats.co.ke. The link opens the user's email composer with the reference and business name filled in. It does not send an email automatically. Staff can search the reference in Vendor Review and in the Customer Care inbox.

## Chat

- Web: bottom-right customer-care launcher on the home/shopping experience and partner portal. Signed-out visitors can sign in or email support.
- Mobile: account/profile launcher above the bottom navigation, including the rider profile. The existing rider Help > Live chat entry opens the real conversation.
- Staff: `apps/admin` > Customer care. Existing provisioned admin and support accounts can reply. Support accounts see only Customer Care and Ticket Desk. There is no public staff registration or Google login.
- Store Operations: partners can also access tracking and customer care from `apps/admin-operations`.

Each account has one persistent customer-care thread and a linked ticket. Messages have server timestamps, sender identities, sequential ordering and client retry IDs. The server enforces ownership on reads, sends and read receipts, and staff-only access to the inbox and resolution. Reading a thread updates its read cursor; clients show sent/seen status and unread badges. Resolved threads reopen on the next message. Earlier messages can be loaded with a cursor.

Live delivery uses bounded 25-second HTTP long polling, checking the conversation version once per second. It works across multiple API instances against the same database without sticky sessions. Idle/closed chat and inbox checks run less frequently. Mobile backgrounding pauses the connection. Failed sends retain the draft and retry ID while the component is mounted, preventing duplicates after an uncertain network response. This is in-app live messaging; it does not send device push notifications while the app is closed. No agent-presence or guaranteed response-time claims are shown.

## Deployment

Before deploying the API, run `node scripts/migrateCustomerCare.js` from `apps/backend` against the target SokoEats database. This adds the application-reference trigger and `sokoeats_chat_conversations` / `sokoeats_chat_messages` tables. The local database has been migrated. The script does not seed sample shops or accounts. Existing backend URLs, authentication and CORS configuration remain in use; the deployed web/admin origins must be included in the backend's existing CORS configuration.

Authenticated API paths are under `/api/care`: `application`, `conversation`, `conversation/messages`, `inbox`, `conversations/:id`, `conversations/:id/messages`, and `conversations/:id/read`. Conversation status changes use `PATCH conversations/:id`.

Keep HTTP proxy request timeouts above 25 seconds. Size database capacity for one small indexed query per second per open chat; monitor usage before scaling concurrency substantially. Message bodies are stored in the database, not printed to request logs. The sender is derived from the authenticated database account, not supplied by the client. Deleted users and revoked sessions are rejected; inactive staff cannot access customer-care tools. Pending/rejected partners can contact support using their valid account session.

## Verification

`node scripts/checkCustomerCare.js` checks application-reference stability, ownership, validation, staff authorization, idempotent retries, live replies, read receipts, history cursors, resolution and reopening. All test users/messages are created in a rollback-only transaction. Setting `CARE_BROWSER_CHECK=1` also runs a real web-to-admin browser exchange using a temporary API fixture, with desktop/mobile viewport screenshots. The browser check expects web on port 3000, admin on 5174 and an installed Playwright runtime. It does not send actual emails or contact a payment provider.
