# Partner Terms of Service

The published English rider, vendor and merchant agreements identify the operator as EkaziConnect Solutions Ltd, International Hse, 2nd flr, Rm12, support@sokoeats.co.ke, as supplied by the business owner.

## Release Checklist

- Obtain Kenyan legal review before public launch. This is a working contractual draft, not a certification of compliance or enforceability. Confirm the registered name, complete postal address, applicable licences, insurance, privacy notice, record-retention schedule, ODPC obligations and commercial schedules.
- Run `node scripts/migrateTermsAcceptance.js` from `apps/backend` on each deployed database before releasing the new API. It adds columns and a receipts table without seeding data or fabricating acceptance for existing accounts.
- Public documents: `GET /api/legal/terms/rider`, `/vendor`, `/merchant`.
- Signup requires `termsAcceptance: { accepted: true, role, version, hash }` matching the server document. The backend derives the account role; a caller cannot choose a less restrictive document.
- Google authenticates identity only. A rider without recorded consent has an incomplete profile and must accept through `PATCH /api/auth/profile` before operational mutations. Existing partner accounts without a receipt must accept too. Customer signup and administrator provisioning do not acquire fictitious partner acceptance.
- Web and mobile require opening the document and checking an initially unchecked box. Role changes clear acceptance. Terms are scrollable; users need not perform an arbitrary scroll-to-bottom action. Fetch failures block acceptance and offer retry. Users can download/share a copy, and signed-in users can reopen their accepted snapshot.
- `GET /api/auth/terms/acceptances` returns only the authenticated user's receipts. Receipts contain the role, version, SHA-256 document digest, full document snapshot and server timestamp. Acceptance and account creation/profile changes are transactional. Retries are idempotent. No new IP or device fingerprint collection was added.
- Terms acceptance is separate from the commission agreement, payment-provider KYC and optional marketing. No silent marketing opt-in is needed for account creation.
- The old unauthenticated global merchant terms writer has been removed. Legacy onboarding submissions return 410 and direct clients to verified account registration; the legacy terms route delegates to the authenticated profile workflow.

## Versioning

`apps/backend/services/partnerTerms.js` owns the complete documents and `TERMS_VERSION`. Publish a new version and effective date when changing content, operator details, or material commercial policy. Do not silently edit published versions. Historical snapshots remain in `sokoeats_terms_acceptances`. User columns are a current-acceptance index, not a substitute for receipts. Old automatically populated `terms_accepted_at` values alone never establish consent.

The business must implement its retention/deletion policy for receipts and maintain restricted database access and backups. There is intentionally no public receipt-edit endpoint. Do not delete acceptance evidence when resolving routine account closure; evaluate applicable retention obligations first.

## Drafting References

- [Kenya Consumer Protection Act](https://new.kenyalaw.org/akn/ke/act/2012/46/eng%402022-12-31): preserve applicable statutory remedies, make terms available before agreement, and provide copies.
- [ODPC data subject rights](https://www.odpc.go.ke/rights-of-a-data-subject/): data access, correction and appropriate safeguards are not waived by accepting a service contract.
- [Kenya Data Protection Act](https://new.kenyalaw.org/akn/ke/act/2019/24/eng%402022-12-31): processing obligations and complaint rights require a separate operational privacy programme.

## Verification

Backend: `node --test tests/partnerTerms.test.js` and `node scripts/checkTermsAcceptance.js`. The integration script uses rollback-only test accounts and does not seed production data. Web/mobile: `node node_modules/typescript/bin/tsc --noEmit`. Web: `node node_modules/next/dist/bin/next build`; `scripts/checkPartnerTerms.cjs` exercises dialogs at desktop/mobile viewport sizes with Playwright when available.
