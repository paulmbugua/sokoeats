'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@mytutorapp/shared/hooks/reactQueryClient';
import ShopContextProvider from '@mytutorapp/shared/context/ShopContext';
import { ChatProvider } from '@mytutorapp/shared/context/ChatContext';
import { ThemeProvider } from '@mytutorapp/shared/hooks';
import { publicEnv } from '@/lib/env';

const storage = {
  getItem: async (k: string) => Promise.resolve(localStorage.getItem(k)),
  setItem: async (k: string, v: string) => {
    localStorage.setItem(k, v);
  },
  removeItem: async (k: string) => {
    localStorage.removeItem(k);
  },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const backendUrl = publicEnv.backendUrl || '';
  const sharedChildren = children as unknown as React.ComponentProps<typeof ThemeProvider>['children'];

  // ✅ Create QueryClient per app instance (Next-safe)
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
    if (backendUrl) axios.defaults.baseURL = backendUrl;
  }, [backendUrl]);

  return (
    <QueryClientProvider client={queryClient}>
      <ShopContextProvider backendUrl={backendUrl} storage={storage} queryClient={queryClient}>
        <ChatProvider>
          <ThemeProvider applyToDocument storageKey="theme">
            {sharedChildren}
          </ThemeProvider>
        </ChatProvider>
      </ShopContextProvider>
    </QueryClientProvider>
  );
}
