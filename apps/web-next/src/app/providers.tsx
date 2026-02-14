'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@mytutorapp/shared/hooks/reactQueryClient';
import ShopContextProvider from '@mytutorapp/shared/context/ShopContext';
import { ChatProvider } from '@mytutorapp/shared/context/ChatContext';
import { ThemeProvider } from '@mytutorapp/shared/hooks';
import type { ThemeMode } from '@mytutorapp/shared/hooks/useTheme';
import { publicEnv } from '@/lib/env';

// ✅ Async-storage compatible wrapper (consistent Promise<void>)
const storage = {
  getItem: async (k: string): Promise<string | null> => localStorage.getItem(k),
  setItem: async (k: string, v: string): Promise<void> => {
    localStorage.setItem(k, v);
  },
  removeItem: async (k: string): Promise<void> => {
    localStorage.removeItem(k);
  },
};

export default function Providers({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: ThemeMode;
}) {
  const backendUrl = publicEnv.backendUrl || '';
  const sharedChildren = children as unknown as React.ComponentProps<typeof ThemeProvider>['children'];

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  useEffect(() => {
    if (!backendUrl) return;

    axios.defaults.baseURL = backendUrl;

    const debugHttp =
      process.env.NODE_ENV !== 'production' &&
      (publicEnv.debugHttp || new URLSearchParams(window.location.search).has('debug_http'));

    if (!debugHttp) return;

    const interceptorId = axios.interceptors.response.use(
      (r) => r,
      (error) => {
        const cfg = error?.config || {};
        const status = error?.response?.status;
        const data = error?.response?.data ?? error?.message;
        console.error('[HTTP]', cfg?.method?.toUpperCase(), cfg?.url, status, data);
        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptorId);
  }, [backendUrl]);

  return (
    <QueryClientProvider client={queryClient}>
      <ShopContextProvider backendUrl={backendUrl} storage={storage} queryClient={queryClient}>
        <ChatProvider>
          <ThemeProvider applyToDocument storageKey="theme" initialTheme={initialTheme}>
            {sharedChildren}
          </ThemeProvider>
        </ChatProvider>
      </ShopContextProvider>
    </QueryClientProvider>
  );
}
