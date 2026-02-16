# Firebase Auth env checklist for web-next deployments

`apps/web-next` requires public Firebase client env vars at build time.

Set these in your hosting provider (Netlify/Vercel project settings):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`

Optional:

- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

If any required key is missing, Google login is disabled and users will see:

> Auth is temporarily unavailable (missing web config). Please contact support@daybreaklearner.com.

The shared resolver in `packages/shared/utils/firebaseConfig.ts` is the source of truth for runtime validation and missing-key diagnostics.
