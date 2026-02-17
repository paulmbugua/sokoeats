# Google Ads phishing suspension hardening

## Redirects added (single-hop, permanent)

The following legacy ad-entry URLs now permanently redirect to safe public web-next routes on the same domain:

- `/app/find-tutor` → `/find-tutor`
- `/app/resources` → `/resources`
- `/app/org/login` → `/institutions`

These are defined in `next.config.mjs` using Next.js `redirects()` with `permanent: true` to produce 308 redirects.

## Trust block usage

A reusable `TrustBlock` component was added at `src/components/TrustBlock.tsx` and placed visibly on:

- `/find-tutor`
- `/resources`
- `/institutions`
- `/institutions/login`

The block includes:

- Brand + business identity (`DayBreak Learner`, `EKAZICONNECT SOLUTIONS LTD`)
- `support@daybreaklearner.com`
- Internal policy links: `/privacy`, `/terms`, `/anti-spam`, `/refunds`, `/complaints`, `/fulfillment`, `/payment-flow`
- Security statement:
  `We never ask for credentials on third-party sites. Always verify daybreaklearner.com.`

## Verification commands

```bash
curl -I https://www.daybreaklearner.com/app/find-tutor
curl -I https://www.daybreaklearner.com/app/resources
curl -I https://www.daybreaklearner.com/app/org/login
```

Expected: each returns a single permanent redirect directly to its destination.
