# Ekazi Web Cloudflare Worker

This app is a Vite React SPA, so it uses Cloudflare Workers Static Assets, not OpenNext.

Set these Cloudflare build/runtime variables:

- `VITE_BACKEND_URL=https://server.ekazi.co.ke`
- `VITE_API_URL=https://server.ekazi.co.ke`
- `VITE_SITE_URL=https://ekazi.co.ke`
- `VITE_GOOGLE_WEB_CLIENT_ID=912636242362-m5hogktgcnramtb6g132aada1jftsfrl.apps.googleusercontent.com`
- `VITE_IMAGES_BASE_URL=https://images.ekazi.co.ke`
- `VITE_PREVIEWS_BASE_URL=https://previews.ekazi.co.ke`

Worker runtime vars in `wrangler.json` power `/env.js`. Build-time `VITE_*` vars are still embedded by Vite during `vite build`.
