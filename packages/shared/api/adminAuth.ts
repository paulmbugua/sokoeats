export type AdminAuthRole = 'customer' | 'rider' | 'vendor' | 'merchant' | 'support' | 'admin';

function readEnv(name: string) {
  return typeof import.meta !== 'undefined' ? String((import.meta as any).env?.[name] || '') : '';
}

export function googleWebClientId() {
  return readEnv('VITE_GOOGLE_CLIENT_ID') || readEnv('VITE_GOOGLE_WEB_CLIENT_ID') || readEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
}

export function firebaseApiKey() {
  return readEnv('VITE_FIREBASE_API_KEY') || readEnv('EXPO_PUBLIC_FIREBASE_API_KEY');
}

export function firebaseProjectId() {
  return readEnv('VITE_FIREBASE_PROJECT_ID') || readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
}

export function adminRoleLabel(role: AdminAuthRole) {
  if (role === 'admin') return 'Platform Admin';
  if (role === 'support') return 'Support Agent';
  if (role === 'merchant') return 'Merchant Admin';
  if (role === 'vendor') return 'Vendor Operator';
  if (role === 'rider') return 'Rider';
  return 'Buyer';
}

export function adminAccountGuidance(role: AdminAuthRole) {
  if (role === 'admin') return 'Platform admins are invited by an existing owner/admin, then sign in with Google or password using a private invite code.';
  if (role === 'support') return 'Support agents are invited by operations, then use Google or password with a private invite code before accessing tickets.';
  if (role === 'merchant') return 'Merchant admins can create a business account with Google or password, complete store details, then wait for review approval.';
  if (role === 'vendor') return 'Vendor operators can create a store account with Google or password, upload business details, and manage products after review.';
  return 'Use customer or rider onboarding in the mobile app for personal accounts.';
}

export async function exchangeGoogleCredentialForFirebaseIdToken(googleIdToken: string, requestUri?: string) {
  const apiKey = firebaseApiKey();
  if (!apiKey) return googleIdToken;
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: 'id_token=' + encodeURIComponent(googleIdToken) + '&providerId=google.com',
      requestUri: requestUri || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost'),
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.idToken) {
    const detail = payload?.error?.message ? ' Firebase said: ' + payload.error.message : '';
    throw new Error('Firebase Google sign-in failed.' + detail);
  }
  return String(payload.idToken);
}
