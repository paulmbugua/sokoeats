// apps/admin/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ShopContextProvider } from '@myhandymanapp/shared/context';
import { queryClient } from '@myhandymanapp/shared/utils/queryClient';
import App from './App';
import './index.css';

const backendUrl =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  (window as any).__BACKEND_URL__ ||
  'http://localhost:4000';

const storage = {
  getItem: async (k: string) =>
    Promise.resolve(localStorage.getItem(k)),
  setItem: async (k: string, v: string) => {
    localStorage.setItem(k, v);
    return Promise.resolve();
  },
  removeItem: async (k: string) => {
    localStorage.removeItem(k);
    return Promise.resolve();
  },
};

function ProviderWithNav({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const navigateFn = (dest: string) => navigate(dest);
  return (
    <ShopContextProvider backendUrl={backendUrl} storage={storage} navigateFn={navigateFn}>
      {children}
    </ShopContextProvider>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProviderWithNav>
          <App />
        </ProviderWithNav>
      </BrowserRouter>
      {(import.meta as any).env?.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>
);
