# GA4 verification (web-next + Vite /app)

## Environment configuration

Set the canonical GA4 measurement ID everywhere so both frontends report to the same property:

```
GA4_MEASUREMENT_ID=G-9RVE7JK88W
VITE_GA4_MEASUREMENT_ID=G-9RVE7JK88W
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-9RVE7JK88W
```

`GA4_MEASUREMENT_ID` is the canonical value; `VITE_GA4_MEASUREMENT_ID` and
`NEXT_PUBLIC_GA4_MEASUREMENT_ID` are the app-specific mappings for Vite and Next.js.

## Manual verification checklist

1. **Page source contains gtag.js**
   - Visit `https://www.daybreaklearner.com/` and `https://www.daybreaklearner.com/app/robot-teach`.
   - View page source; confirm `https://www.googletagmanager.com/gtag/js?id=G-9RVE7JK88W` exists.
2. **Network requests fire**
   - Open DevTools → Network.
   - Filter by `g/collect` and confirm `page_view` hits are sent on navigation.
3. **DebugView/Realtime**
   - Visit any page with `?ga_debug=1` appended.
   - Confirm `page_view` and custom events appear in GA4 DebugView.
4. **SPA navigation**
   - Navigate within `/app/*` and confirm new `page_view` hits on each route change.

## Local dev commands

```
yarn workspace web dev
yarn workspace web-next dev
```

To test the proxy locally, configure the web-next dev server to forward `/app/*`
to the Vite dev server (per existing proxy/rewrites setup), then visit:

```
http://localhost:3000/app/robot-teach
```

## Console snippets (optional)

```js
window.dataLayer?.slice(-5);
window.gtag?.('event', 'page_view', { page_path: window.location.pathname });
```
