'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ShopContextProvider from '@mytutorapp/shared/context/ShopContext';
import { ChatProvider } from '@mytutorapp/shared/context/ChatContext';
import { ThemeProvider } from '@mytutorapp/shared/hooks';

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
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';

  // ✅ Create QueryClient per app instance (Next-safe)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: false,
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
            {children}
          </ThemeProvider>
        </ChatProvider>
      </ShopContextProvider>
    </QueryClientProvider>
  );
}
