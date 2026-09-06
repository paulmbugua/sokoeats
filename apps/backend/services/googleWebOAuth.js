export function googleWebCredentials(env = process.env) {
  const clientId = String(env.GOOGLE_CLIENT_ID_WEB || '').trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Google sign-in is temporarily unavailable. Please use email sign-in.'), { status: 503, code: 'google_oauth_not_configured' });
  }
  return { clientId, clientSecret };
}

export async function exchangeGoogleWebCode({ code, redirectUri }, { env = process.env, fetcher = fetch, logger = console } = {}) {
  const { clientId, clientSecret } = googleWebCredentials(env);
  if (!code) throw new Error('Google sign-in was not completed. Please try again.');
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(15000),
  });
  const tokens = await response.json().catch(() => ({}));
  if (!response.ok || !tokens.id_token) {
    // Log only known error codes, never Google's raw response, credentials, or tokens.
    const code = ['invalid_client', 'invalid_grant', 'redirect_uri_mismatch'].includes(tokens.error) ? tokens.error : 'token_exchange_failed';
    logger.warn('[SokoEats][Auth] google-web:token-exchange-failed', {
      status: response.status, code,
      ...(code === 'invalid_client' ? { action: 'Set GOOGLE_CLIENT_SECRET to an active secret for the exact GOOGLE_CLIENT_ID_WEB Web OAuth client, then restart the backend.' } : {}),
    });
    const message = code === 'invalid_client'
      ? 'Google sign-in is temporarily unavailable due to a server configuration issue. Please use email sign-in or contact support.'
      : code === 'invalid_grant'
        ? 'This Google sign-in attempt has expired. Please start again.'
        : 'Google sign-in could not be completed. Please try again.';
    throw Object.assign(new Error(message), { status: code === 'invalid_client' ? 503 : 401, code });
  }
  logger.info('[SokoEats][Auth] google-web:token-exchange-success');
  return tokens.id_token;
}
