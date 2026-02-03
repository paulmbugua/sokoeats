import axios from 'axios';
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'katex/dist/katex.min.css';

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
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@mytutorapp/shared/utils/queryClient'; // <-- shared singleton
import { ensureBrowserPersistence } from '@mytutorapp/shared/utils/firebaseConfig'; // ✅ NEW
import { initGA4 } from './analytics/ga4';

const DevSafeStrictMode: React.FC<React.PropsWithChildren> = ({ children }) =>
  import.meta.env.DEV ? <>{children}</> : <React.StrictMode>{children}</React.StrictMode>;

// Optional: expose for any old code that reads window.queryClient
(window as any).queryClient = queryClient;

const DEBUG =
  import.meta.env.VITE_DEBUG_ERRORS === '1' ||
  new URLSearchParams(window.location.search).has('debug');

function toError(e: unknown): Error | undefined {
  if (!e) return undefined;
  if (e instanceof Error) return e;
  // react-error-boundary sometimes passes strings/objects
  return new Error(typeof e === 'string' ? e : JSON.stringify(e));
}

function Fallback({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const err = toError(error);

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
        padding: 16,
        gap: 12,
      }}
    >
      <h1>Something went wrong.</h1>
      <p>Please try refreshing the page.</p>

      {DEBUG && err && (
        <details
          open
          style={{
            width: 'min(100%, 960px)',
            maxHeight: 300,
            overflow: 'auto',
            background: '#111',
            color: '#eee',
            padding: 12,
            borderRadius: 8,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
          }}
        >
          <summary style={{ cursor: 'default', marginBottom: 8 }}>Error details (debug on)</summary>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {err.name}: {err.message}
            {'\n'}
            {err.stack}
          </pre>
        </details>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #ccc',
            background: '#f5f5f5',
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}


const backendUrl = import.meta.env.VITE_BACKEND_URL;
const routerBase = import.meta.env.VITE_BRIDGED === '1' ? '/app' : undefined;
if (backendUrl) axios.defaults.baseURL = backendUrl;

// ✅ Initialize GA4 once (loads gtag.js + config)
initGA4();

// ✅ Ensure Firebase uses browser local persistence (safe no-op outside browser)
void ensureBrowserPersistence();

// In production with DEBUG enabled, surface HTTP + global errors
if (import.meta.env.PROD && DEBUG) {
  axios.interceptors.response.use(
    (r) => r,
    (error) => {
      const { config, response } = error || {};
      const method = config?.method?.toUpperCase();
      const url = config?.url;
      const status = response?.status;
      const payload = response?.data ?? error?.message;
      console.error('[HTTP]', method, url, status, payload, error);
      return Promise.reject(error);
    }
  );
  window.addEventListener('error', (e) => console.error('[WindowError]', e.message, e.error || e));
  window.addEventListener('unhandledrejection', (e) =>
    console.error('[UnhandledRejection]', e.reason)
  );
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

axios.interceptors.response.use(
  (r) => r,
  async (error) => {
    const status = error?.response?.status;
    const cfg = error?.config || {};
    if (status === 429 && !cfg.__retried) {
      const retryAfter =
        Number(error.response?.headers?.['retry-after']) ||
        Number(error.response?.headers?.['x-ratelimit-reset']) ||
        1;
      cfg.__retried = (cfg.__retried || 0) + 1;
      if (cfg.__retried <= 2) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return axios(cfg);
      }
    }
    return Promise.reject(error);
  }
);

// ---- createRoot singleton (prevents "createRoot called twice") ----
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
    <DevSafeStrictMode>
      <HelmetProvider>
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <Fallback error={error} onRetry={resetErrorBoundary} />
          )}
          onError={(error, info) => {
            console.error('[ErrorBoundary]', error, info);
          }}
        >
          <BrowserRouter basename={routerBase}>
            <QueryClientProvider client={queryClient}>
              <ShopContextProvider backendUrl={backendUrl} storage={storage}>
                <ChatProvider>
                  <ThemeProvider applyToDocument storageKey="theme">
                    <GlobalAuthRedirect />
                    <ScrollToTop />
                    <App />
                  </ThemeProvider>
                </ChatProvider>
              </ShopContextProvider>

              {(import.meta.env.DEV || DEBUG) && <ReactQueryDevtools initialIsOpen={false} />}
            </QueryClientProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </HelmetProvider>
    </DevSafeStrictMode>
  );
}
