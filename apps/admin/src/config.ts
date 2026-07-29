// apps/Admin/src/config.ts
export const APP_BACKEND_URL =
  (typeof window !== 'undefined' && (window as any).__EKAZI_ENV__?.VITE_BACKEND_URL) ||
  (typeof window !== 'undefined' && (window as any).__EKAZI_ENV__?.VITE_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && (process as any).env?.VITE_BACKEND_URL) ||
  (typeof process !== 'undefined' && (process as any).env?.VITE_API_URL) ||
  (typeof window !== 'undefined' && (window as any).__BACKEND_URL__) ||
  '';
