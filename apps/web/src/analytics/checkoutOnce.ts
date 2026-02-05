export const trackCheckoutOnce = (key: string, fn: () => void): void => {
  if (typeof window === 'undefined') {
    fn();
    return;
  }
  try {
    const storageKey = `ga4:begin_checkout:${key}`;
    if (sessionStorage.getItem(storageKey) === '1') return;
    sessionStorage.setItem(storageKey, '1');
    fn();
  } catch {
    fn();
  }
};

export const clearCheckoutOnce = (key: string): void => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(`ga4:begin_checkout:${key}`);
  } catch {
    // no-op
  }
};
