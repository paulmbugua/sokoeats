export type CheckoutStashPayload = {
  kind: 'tokens' | 'org';
  credits?: number;
  tier?: string;
  cycle?: string;
  seats?: number;
  currency?: string;
  value?: number;
  reference?: string;
  orgId?: string | number;
  orgName?: string;
  timestamp?: number;
};

export const stashCheckout = (key: string, payload: CheckoutStashPayload) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // no-op
  }
};

export const readCheckout = (key: string): CheckoutStashPayload | null => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutStashPayload;
  } catch {
    return null;
  }
};

export const clearCheckout = (key: string) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // no-op
  }
};
