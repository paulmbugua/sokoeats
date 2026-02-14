// packages/shared/hooks/useTheme.ts
import React, { createContext, useContext, useRef, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useAppQuery from './useAppQuery';

export type ThemeMode = 'light' | 'dark';

type ThemeValue = {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
};

type ThemeStorage = {
  read: (key: string) => Promise<ThemeMode | undefined>;
  write: (key: string, value: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeValue | null>(null);

/* ---------- applier registry (no RN imports in shared) ---------- */
export type ThemeApplier = (mode: ThemeMode) => void;
const themeAppliers = new Set<ThemeApplier>();
export function registerThemeApplier(applier: ThemeApplier) {
  themeAppliers.add(applier);
  return () => {
    // <- return void, ignore boolean
    themeAppliers.delete(applier);
  };
}

/* ---------- system + localStorage helpers (web) ---------- */

const getSystem = (): ThemeMode => {
  try {
    // RN can polyfill this without importing RN in shared:
    // (globalThis as any).__RN_COLOR_SCHEME is set by the app.
    const rn = (globalThis as any).__RN_COLOR_SCHEME as 'light' | 'dark' | undefined;
    if (rn === 'dark' || rn === 'light') return rn;

    // Web
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    )
      return 'dark';
  } catch {}
  return 'light';
};

const readThemeLS = async (storageKey: string): Promise<ThemeMode> => {
  try {
    if (typeof document !== 'undefined') {
      const key = `${encodeURIComponent(storageKey)}=`;
      const rawCookie = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(key));
      const cookieTheme = rawCookie ? decodeURIComponent(rawCookie.slice(key.length)) : '';
      if (cookieTheme === 'light' || cookieTheme === 'dark') return cookieTheme;
    }

    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(storageKey) as ThemeMode | null;
      if (v === 'light' || v === 'dark') return v;
    }
  } catch {}
  return getSystem();
};

const writeThemeLS = async (storageKey: string, next: ThemeMode) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, next);
    }

    if (typeof document !== 'undefined') {
      document.cookie = `${encodeURIComponent(storageKey)}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
    }
  } catch {}
};

/* ---------- Provider ---------- */

export const ThemeProvider: React.FC<{
  children: React.ReactNode;
  storageKey?: string;
  applyToDocument?: boolean; // web only
  storage?: ThemeStorage; // RN/alt storage adapter
  initialTheme?: ThemeMode;
}> = ({ children, storageKey = 'theme', applyToDocument = false, storage, initialTheme = 'light' }) => {
  const qc = useQueryClient();

  const read = async () => {
    const v = storage ? await storage.read(storageKey) : await readThemeLS(storageKey);
    return v ?? initialTheme;
  };

  const { data } = useAppQuery<ThemeMode, Error>(['theme', storageKey], read, {
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const theme = (data ?? initialTheme) as ThemeMode;

  const setTheme = (next: ThemeMode) => {
    (storage?.write(storageKey, next) ?? writeThemeLS(storageKey, next)).catch(() => {});
    qc.setQueryData<ThemeMode>(['theme', storageKey], next);

    // Notify platform appliers (RN: tw.setColorScheme, etc.)
    themeAppliers.forEach((fn) => {
      try {
        fn(next);
      } catch {}
    });
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  // Apply side-effects (notify appliers + <html>.dark) safely after render
  const appliedRef = useRef<ThemeMode | null>(null);
  useLayoutEffect(() => {
    if (appliedRef.current === theme) return;

    themeAppliers.forEach((fn) => {
      try {
        fn(theme);
      } catch {}
    });

    if (applyToDocument && typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }

    appliedRef.current = theme;
  }, [theme, applyToDocument]);

  const value: ThemeValue = { theme, setTheme, toggleTheme };
  return React.createElement(ThemeContext.Provider, { value }, children as React.ReactNode);
};

/* ---------- Hooks ---------- */

export function useThemeProvider() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeProvider must be used within <ThemeProvider>');
  return ctx;
}

// Enforce provider usage (safer on RN; prevents accidental localStorage hits)
export default function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
