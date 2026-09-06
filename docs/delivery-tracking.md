# Delivery pins and tracking

## Deployment

Run `node scripts/migrateDeliveryTracking.js` from `apps/backend` before deploying the API. This migration is additive and is also included in database setup. It has been applied to the configured development database. It does not seed demo orders or send payments.

## Buyer

In mobile checkout choose Your location, then Your current location, or tap/drag a pin. GPS has a 15-second deadline and reverse geocoding has an 8-second deadline. The initial Nairobi viewport is not a delivery pin. Review GPS accuracy and adjust to the entrance; add building/floor/gate instructions to the address before confirming. Pin changes reprice delivery before payment. During a pending payment the location is locked. The paid quote supplies the order coordinates and its address must match when placing the order.

After payment the buyer goes to Orders. Open the order to see milestones, timestamps, an estimated arrival after pickup, and the latest rider position. The same account can access tracking from the web account page. Time estimates derive from the quoted driving duration at dispatch, not a live traffic prediction. Late deliveries show an overdue state, not an invented new ETA.

## Shop and rider

Store Operations (`apps/admin-operations`) and the web Partner Portal now show Orders and dispatch. Select a paid order, accept, start preparing, and mark ready. The recipient, items, delivery pin and rider assignment are available only to authorised participants.

An approved rider sees available deliveries in their assigned zones, accepts one, then opens it and chooses Share live location. Pickup requires the shop's ready status. Arrival requires a location no older than 90 seconds, accuracy within 100 metres and distance within 200 metres of the delivery pin. Handover requires the recipient's six-digit OTP and continues the existing settlement lifecycle. The recipient receives the existing SMS milestones; SMS failures are recorded without rolling back delivery progress.

## Current limits

- Polling is every 15 seconds while the view is active. It resumes immediately on foregrounding; no synthetic progress is generated.
- Rider GPS sharing is opt-in and foreground-only, and stops when the tracking sheet closes or delivery ends. Background/lock-screen tracking and push notifications are not implemented here. Opening external navigation can suspend GPS updates. A position older than 90 seconds is marked stale, and a completed order does not expose rider location or contact numbers.
- Existing orders get their real creation event backfilled. Missing historic milestones are not assigned invented timestamps.
- SMS delivery still depends on configured provider credentials and connectivity. Failed notifications are recorded; this change does not add an SMS retry worker.

## Verification

- `node tests/deliveryTracking.test.js`: access policy, ETA calculations, distance, action/OTP and coordinate validation.
- `node tests/deliveryAccess.test.js`: unauthorised tracking, stale GPS rejection and preparation gate.
- `node scripts/checkDeliveryTracking.js`: actual PostgreSQL trigger, coordinate persistence and duplicate prevention, with fixture data rolled back.
- `node scripts/checkDeliveryLifecycle.js`: database-backed shop acceptance, rider assignment, pickup, OTP and delivery events; no external payment/SMS calls and fixture data rolled back.
- Mobile/web TypeScript and Android JavaScript export. A real two-device paid delivery and native release build still require acceptance testing.
