# SokoEats deployment

## Cloudflare Workers

These commands are run from the repository root. Authenticate once with `npx wrangler login`, and create the three Worker names in Cloudflare on the first deployment. Set the production API URL variables in each app's Cloudflare build environment before building.

### Customer web (`apps/web`, Next.js + OpenNext)

Build:

```powershell
yarn workspace @sokoeats/web cf:build
```

Deploy:

```powershell
yarn workspace @sokoeats/web cf:deploy
```

The Worker is `sokoeats-web` and is configured by `apps/web/wrangler.jsonc`. OpenNext generates `.open-next` during the build; it is a build artifact and must not be committed.

### Platform admin (`apps/admin`, Vite SPA)

Build:

```powershell
yarn workspace @sokoeats/admin cf:build
```

Deploy:

```powershell
yarn workspace @sokoeats/admin cf:deploy
```

The Worker is `sokoeats-admin`. SPA fallback is enabled so client-side routes resolve to `index.html`.

### Operations dashboard (`apps/admin-operations`, Vite SPA)

Build:

```powershell
yarn workspace @sokoeats/admin-operations cf:build
```

Deploy:

```powershell
yarn workspace @sokoeats/admin-operations cf:deploy
```

The Worker is `sokoeats-admin-operations`. SPA fallback is enabled in `apps/admin-operations/wrangler.jsonc`.

## Cloudflare variables

Use the app templates as the starting point:

- `apps/web/.env.cloudflare.example`
- `apps/admin/.env.cloudflare.example`
- `apps/admin-operations/.env.cloudflare.example`

`NEXT_PUBLIC_*` and `VITE_*` values are build-time variables. Do not put backend secrets, JWT secrets, Paystack secret keys, database URLs, or Firebase service-account private keys in these files or in a browser Worker. Configure those only in Railway backend variables or Cloudflare encrypted secrets when a Worker actually needs them.

## Backend on Railway

The repository includes `railway.toml`. Equivalent Railway dashboard commands are:

Build command:

```text
corepack yarn install --immutable && corepack yarn workspace @sokoeats/backend build
```

Start command:

```text
corepack yarn workspace @sokoeats/backend start
```

Railway must provide at least `PORT`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, and the production payment, Google, Firebase, email, SMS, R2, and Maps variables already documented in `apps/backend/.env.example`. The Express server reads Railway's assigned `PORT`; do not hard-code port 4000 in production.

## Post-deploy checks

1. Confirm `https://api.sokoeats.co.ke/health` returns successfully.
2. Confirm each frontend's API variable points to the Railway API, not localhost.
3. Verify Google OAuth callback origins and redirect URIs for every production hostname.
4. Verify Paystack webhook and callback URLs use the Railway API hostname.
5. Verify Cloudflare custom domains and DNS records for each Worker before accepting traffic.
