// apps/web/src/main.tsx
import axios, { AxiosResponse } from 'axios';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import ShopContextProvider from '@mytutorapp/shared/context/ShopContext';
import { ChatProvider } from '@mytutorapp/shared/context/ChatContext';
import { ErrorBoundary } from 'react-error-boundary';
import { ThemeProvider } from '@mytutorapp/shared/hooks';
import GlobalAuthRedirect from './components/GlobalAuthRedirect';
import ScrollToTop from './components/ScrollToTop';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ✅ REMOVED: staleTime: 1000 * 60 * 5
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Fallback() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
        color: '#333',
      }}
    >
      <h1>Something went wrong.</h1>
      <p>Please try refreshing the page.</p>
    </div>
  );
}

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const routerBase = import.meta.env.VITE_BRIDGED === '1' ? '/app' : undefined;
if (backendUrl) axios.defaults.baseURL = backendUrl;

if (import.meta.env.PROD) {
  // window.alert = () => {};
  // axios.interceptors.response.use(
  //  (r) => r,
  //  (error) => { console.log('🔇 Suppressed backend error:', error); return Promise.reject(error); }
  // );
}

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

// ---- FIX: createRoot singleton (prevents "createRoot called twice") ----
declare global {
  interface Window {
    __MYAPP_ROOT__?: ReactRoot;
  }
}

const container = document.getElementById('root');
if (!container) {
  console.error('Root element not found');
} else {
  const root = window.__MYAPP_ROOT__ ?? ReactDOM.createRoot(container);
  window.__MYAPP_ROOT__ = root;

  root.render(
    <React.StrictMode>
      <HelmetProvider>
        <ErrorBoundary FallbackComponent={Fallback}>
          <BrowserRouter basename={routerBase}>
            <QueryClientProvider client={queryClient}>
              <ShopContextProvider backendUrl={backendUrl} storage={storage}>
                <ChatProvider>
                  <ThemeProvider applyToDocument storageKey="theme">
                    {/* ⬇️ inside Router + Contexts */}
                    <GlobalAuthRedirect />
                    <ScrollToTop />
                    <App />
                  </ThemeProvider>
                </ChatProvider>
              </ShopContextProvider>

              {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
            </QueryClientProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </HelmetProvider>
    </React.StrictMode>
  );
}
