const DEFAULT_PUBLIC_ENV = {
  VITE_BACKEND_URL: 'https://server.ekazi.co.ke',
  VITE_API_URL: 'https://server.ekazi.co.ke',
  VITE_SITE_URL: 'https://ekazi.co.ke',
  VITE_GOOGLE_WEB_CLIENT_ID: '912636242362-m5hogktgcnramtb6g132aada1jftsfrl.apps.googleusercontent.com',
  VITE_IMAGES_BASE_URL: 'https://images.ekazi.co.ke',
  VITE_PREVIEWS_BASE_URL: 'https://previews.ekazi.co.ke',
};

const PUBLIC_ENV_KEYS = Object.keys(DEFAULT_PUBLIC_ENV);

function publicEnv(env) {
  return PUBLIC_ENV_KEYS.reduce((out, key) => {
    out[key] = env?.[key] || DEFAULT_PUBLIC_ENV[key] || '';
    return out;
  }, {});
}

function envResponse(env) {
  const payload = JSON.stringify(publicEnv(env));
  return new Response(
    `window.__EKAZI_ENV__ = Object.assign({}, window.__EKAZI_ENV__ || {}, ${payload});\nwindow.__BACKEND_URL__ = window.__EKAZI_ENV__.VITE_BACKEND_URL || window.__EKAZI_ENV__.VITE_API_URL || window.__BACKEND_URL__ || '';\n`,
    {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}

function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/env.js') return envResponse(env);
    return secure(await env.ASSETS.fetch(request));
  },
};
