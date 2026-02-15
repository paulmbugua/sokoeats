# GA4 Audit & Manual Acceptance Tests

## Current-state verification checklist

- [x] **web-next GA4 bootstrap** is injected once in `src/app/layout.tsx` with `gtag.js` and a single `gtag('config', ...)` call using `send_page_view: false`.
- [x] **web-next page view source** is `src/app/_components/GaRouteTracker.tsx` (mounted in layout); no other analytics tracker is mounted in layout.
- [x] **legacy web (`apps/web`)** no longer has inline GA loader/config in `index.html`.
- [x] **legacy sign_up disabled**: no `trackSignUp` calls in `apps/web/src`.
- [x] **legacy duplicate page_view removed**: `apps/web/src/App.tsx` does not emit extra `trackPageView`; route tracking remains in `ScrollToTop`.

## Event ownership and source of truth

- `sign_up`: **web-next only** (consumer + institution signup success paths).
- `begin_checkout`: web-next payment widget checkout start.
- `purchase`: web-next paystack callback after backend verification success (tokens + org).

## Manual acceptance tests

1. Open web-next page and inspect DOM scripts:
   - Confirm only one GA loader script (`https://www.googletagmanager.com/gtag/js?id=...`) is present.
   - Confirm only one `gtag('config', MEASUREMENT_ID, ...)` bootstrap path runs.
2. Consumer signup success in web-next:
   - Submit valid signup.
   - In GA DebugView, verify exactly one `sign_up` event.
   - Confirm no `sign_up` on page load or pre-success button click.
3. Institution signup success in web-next:
   - Complete institution signup.
   - Verify exactly one `sign_up` event with institution method metadata.
4. Begin checkout:
   - Start Paystack checkout from web-next payment widget.
   - Verify exactly one `begin_checkout` event per checkout session key.
5. Purchase callback (tokens):
   - Return through `/paystack/callback` with successful verified transaction.
   - Verify one `purchase` event containing `transaction_id`, `currency`, `value`, and `items`.
6. Purchase callback (org):
   - Complete org paystack flow and return to `/paystack/callback?kind=org&paymentId=...`.
   - Verify one `purchase` event from web-next callback, deduped by transaction ID.
7. Cross-app navigation:
   - Navigate web-next → `/app/*` and back.
   - Ensure key conversion events (`sign_up`, `begin_checkout`, `purchase`) do not double fire.

## Notes

- Key-event dedupe uses `trackOnce` (`sessionStorage` TTL guards) with stable keys:
  - `sign_up`: `signup:<user_id|email_hash|fallback bucket>`
  - `begin_checkout`: `checkout:<checkout_session_id>`
  - `purchase`: `purchase:<transaction_id>`
