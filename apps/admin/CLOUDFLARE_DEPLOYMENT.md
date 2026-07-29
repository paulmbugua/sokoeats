# Ekazi Admin Cloudflare Worker

This app is a Vite React SPA, so it uses Cloudflare Workers Static Assets, not OpenNext.

Set these Cloudflare build/runtime variables:

- `VITE_BACKEND_URL=https://server.ekazi.co.ke`
- `VITE_API_URL=https://server.ekazi.co.ke`
- `VITE_SITE_URL=https://admin.ekazi.co.ke`
- `VITE_IMAGES_BASE_URL=https://images.ekazi.co.ke`
- `VITE_PREVIEWS_BASE_URL=https://previews.ekazi.co.ke`

Worker runtime vars in `wrangler.json` power `/env.js`. Build-time `VITE_*` vars are still embedded by Vite during `vite build`.
