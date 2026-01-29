'use client';

import React, { useEffect } from 'react';
import axios from 'axios';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@mytutorapp/shared/utils/queryClient';
import ShopContextProvider from '@mytutorapp/shared/context/ShopContext';
import { ChatProvider } from '@mytutorapp/shared/context/ChatContext';
import { ThemeProvider } from '@mytutorapp/shared/hooks';

const storage = {
  getItem: async (k: string) => Promise.resolve(localStorage.getItem(k)),
  setItem: async (k: string, v: string) => {
    localStorage.setItem(k, v);
    return Promise.resolve();
  },
  removeItem: async (k: string) => {
    localStorage.removeItem(k);
    return Promise.resolve();
  },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';

  useEffect(() => {
    if (backendUrl) axios.defaults.baseURL = backendUrl;
  }, [backendUrl]);

  return (
    <QueryClientProvider client={queryClient}>
      <ShopContextProvider backendUrl={backendUrl} storage={storage}>
        <ChatProvider>
          <ThemeProvider applyToDocument storageKey="theme">
            {children}
          </ThemeProvider>
        </ChatProvider>
      </ShopContextProvider>
    </QueryClientProvider>
  );
}
