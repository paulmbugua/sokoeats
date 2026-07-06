type TokenPayload = {
  aud?: unknown;
  azp?: unknown;
  iss?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  iat?: unknown;
};

function decodeBase64Url(value: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const input = value.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const char of input) {
    if (char === '=') break;
    const index = chars.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  try {
    return decodeURIComponent(
      output
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
  } catch {
    return output;
  }
}

function emailDomain(email: unknown) {
  if (typeof email !== 'string' || !email.includes('@')) return undefined;
  return email.split('@').pop();
}

function asIso(seconds: unknown) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

export function summarizeGoogleIdToken(idToken?: string | null) {
  const token = String(idToken || '');
  const parts = token ? token.split('.') : [];
  let payload: TokenPayload | null = null;
  let decodeError: string | undefined;

  if (parts.length >= 2) {
    try {
      const payloadPart = parts[1];
      if (payloadPart) {
        payload = JSON.parse(decodeBase64Url(payloadPart)) as TokenPayload;
      }
    } catch (error) {
      decodeError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    hasToken: Boolean(token),
    tokenLength: token.length,
    partCount: parts.length,
    aud: payload?.aud,
    azp: payload?.azp,
    iss: payload?.iss,
    emailDomain: emailDomain(payload?.email),
    emailVerified: payload?.email_verified,
    issuedAt: asIso(payload?.iat),
    expiresAt: asIso(payload?.exp),
    decodeError,
  };
}

export function logGoogleAuthFlow(step: string, details?: Record<string, unknown>) {
  // Keep all logs under a stable prefix for Logcat / Metro filtering.
  console.log('[google-auth][mobile]', step, details || {});
}
