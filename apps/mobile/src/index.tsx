// apps/mobile/src/index.tsx
import 'react-native-gesture-handler';
import * as Linking from 'expo-linking';

import axios, { isAxiosError } from 'axios';
import React, { useEffect } from 'react';
import { AppState, LogBox, StatusBar, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { registerRootComponent } from 'expo';
import ExpoConstants from 'expo-constants';

import { ThemeProvider, useThemePref } from './theme/ThemeContext';
import { QueryClient,QueryClientProvider, type QueryCacheNotifyEvent } from '@tanstack/react-query';
import { GlobalRefreshProvider } from './refresh/GlobalRefreshProvider';
import {
  NavigationContainer,
  DefaultTheme as NavLight,
  DarkTheme as NavDark,
  useNavigationContainerRef,
  CommonActions,
  type LinkingOptions,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useDeviceContext } from 'twrnc';
import { registerForPushToken, initNotificationListeners } from '../utils/notifications';
import App from './App';
import { ModernAlertProvider } from './components/ModernAlert';
import tw from '../tailwind';

import {
  ShopContextProvider,
  ChatProvider,
  useChatContext,
  useShopContext,
} from '@myhandymanapp/shared/context';
import { storage } from '../utils/storage';
import { queryClient } from '@myhandymanapp/shared/utils/queryClient';

import type { RootStackParamList as MainStackParamList } from './navigation/types';

// ⬇️ Portal provider/host
import { PortalProvider, PortalHost } from '@gorhom/portal';

/* ──────────────────────────────────────────────────────────
   Global dev/production logging
────────────────────────────────────────────────────────── */
if (!__DEV__) {
  LogBox.ignoreAllLogs();
  // eslint-disable-next-line no-console
  console.log = () => {};
  // eslint-disable-next-line no-console
  console.warn = () => {};
  // eslint-disable-next-line no-console
  console.error = () => {};
  // eslint-disable-next-line no-console
  console.info = () => {};
  // eslint-disable-next-line no-console
  console.debug = () => {};
}

/* ──────────────────────────────────────────────────────────
   Expo extras (runtime-config)
────────────────────────────────────────────────────────── */
type AppExtra = {
  EXPO_PUBLIC_BACKEND_URL?: string;
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?: string;
  BACKENDS?: Record<string, string>;
  DEFAULT_BACKEND?: string;
};

function getExtra(): AppExtra {
  const cfg = (ExpoConstants as Record<string, unknown>).expoConfig as { extra?: unknown } | undefined;
  const man = (ExpoConstants as Record<string, unknown>).manifest as { extra?: unknown } | undefined;
  const raw = (cfg?.extra ?? man?.extra ?? {}) as Record<string, unknown>;

  return {
    EXPO_PUBLIC_BACKEND_URL: String(raw.EXPO_PUBLIC_BACKEND_URL || '') || undefined,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:
      String(raw.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '') || undefined,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
      String(raw.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '') || undefined,
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID:
      String(raw.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '') || undefined,
    BACKENDS: (raw.BACKENDS as Record<string, string>) || undefined,
    DEFAULT_BACKEND: (raw.DEFAULT_BACKEND as string) || undefined,
  };
}

const runtimeExtra = getExtra();

(
  [
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  ] as const
).forEach((key) => {
  if (!runtimeExtra[key]) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️ ${key} is not defined in app.config.js extra!`);
  }
});

/* ──────────────────────────────────────────────────────────
   Google Sign-In
────────────────────────────────────────────────────────── */
GoogleSignin.configure({
  webClientId: runtimeExtra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: runtimeExtra.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  scopes: ['email', 'profile'],
  offlineAccess: true,
});

/* ──────────────────────────────────────────────────────────
   Backend URL + Axios interceptors
────────────────────────────────────────────────────────── */
const selectedFromMulti =
  runtimeExtra.BACKENDS && runtimeExtra.DEFAULT_BACKEND
    ? runtimeExtra.BACKENDS[runtimeExtra.DEFAULT_BACKEND]
    : undefined;

const backendUrl =
  selectedFromMulti || runtimeExtra.EXPO_PUBLIC_BACKEND_URL || 'http://10.0.2.2:4005';

axios.defaults.baseURL = backendUrl;
// eslint-disable-next-line no-console
console.log(
  '🔗 Using backend URL (%s): %s',
  runtimeExtra.DEFAULT_BACKEND ?? 'env-single',
  backendUrl
);

axios.interceptors.request.use(
  (config) => config,
  (error: unknown) => Promise.reject(error)
);

axios.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (__DEV__) {
      const msg =
        isAxiosError(error) ? error.message : error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn('[Axios error]', msg);
    }
    return Promise.reject(error);
  }
);

/* ──────────────────────────────────────────────────────────
   React Query: silence errors globally (optional)
────────────────────────────────────────────────────────── */
queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
  if (event.type !== 'updated') return;

  const state = event.query.state;
  if (state.status === 'error') {
    // eslint-disable-next-line no-console
    console.log('🔇 Silenced React Query error:', state.error);
  }
});

/* ──────────────────────────────────────────────────────────
   Deep linking
────────────────────────────────────────────────────────── */
const linking: LinkingOptions<MainStackParamList> = {
  prefixes: ['ekazi://', Linking.createURL('/')],
  config: {
    screens: {
    
    },
  },
};

/* ──────────────────────────────────────────────────────────
   Minimal ShopContext typing (no `any`)
────────────────────────────────────────────────────────── */
type HttpClient = {
  post: (url: string, data?: unknown) => Promise<unknown>;
};

type ShopCtx = {
  http: HttpClient;
  token?: string | null;
  orgToken?: string | null;
  initializing?: boolean;
};

/* ──────────────────────────────────────────────────────────
   Root composition (ThemeProvider only)
────────────────────────────────────────────────────────── */
const RootInner: React.FC = () => {
  const { resolvedScheme } = useThemePref(); // 'light' | 'dark'
  const navRef = useNavigationContainerRef<MainStackParamList>();

  const { http, token, orgToken } = useShopContext() as unknown as ShopCtx;
  const { setAppPresence } = useChatContext();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token && !orgToken) return;

      const pushToken = await registerForPushToken();
      if (!pushToken || cancelled) return;

      try {
        await http.post('/api/push/register', {
          expoPushToken: pushToken,
          platform: Platform.OS,
        });
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[push] registered:', pushToken);
        }
      } catch (e: unknown) {
        if (!__DEV__) return;

        if (isAxiosError(e)) {
          // eslint-disable-next-line no-console
          console.warn('[push] register failed', e.response?.status, e.message);
        } else if (e instanceof Error) {
          // eslint-disable-next-line no-console
          console.warn('[push] register failed', e.message);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[push] register failed', String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [http, token, orgToken]);

  useEffect(() => {
    if (!setAppPresence) return;
    setAppPresence(true);
    const sub = AppState.addEventListener('change', (state) => {
      setAppPresence(state === 'active');
    });
    return () => sub.remove();
  }, [setAppPresence]);

  useEffect(() => {
  const handleResp = (resp: Notifications.NotificationResponse) => {
    const data = resp.notification.request.content.data as unknown as {
      screen?: unknown;
      params?: unknown;
    };

    if (typeof data?.screen !== 'string') return;

    navRef.current?.dispatch(
      CommonActions.navigate({
        name: data.screen as never,
        params: (data.params as never) ?? undefined,
      })
    );
  };

  (async () => {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last) handleResp(last);
  })();

  const cleanup = initNotificationListeners({
    onReceive: () => {},
    onRespond: handleResp,
  });

  return () => cleanup();
}, [navRef]);

  return (
    <>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <GlobalRefreshProvider>
        <NavigationContainer
          ref={navRef}
          theme={resolvedScheme === 'dark' ? NavDark : NavLight}
          linking={linking}
        >
          <App />
        </NavigationContainer>
      </GlobalRefreshProvider>
    </>
  );
};

const Root: React.FC = () => {
  useDeviceContext(tw);

  return (
    <PortalProvider>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ShopContextProvider backendUrl={backendUrl} storage={storage}>
            <ChatProvider>
              <ThemeProvider tw={tw}>
                <ModernAlertProvider>
                  <RootInner />
                  <PortalHost name="classroom-host" />
                </ModernAlertProvider>
              </ThemeProvider>
            </ChatProvider>
          </ShopContextProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </PortalProvider>
  );
};


/* ──────────────────────────────────────────────────────────
   Mount
────────────────────────────────────────────────────────── */
declare global {
  // eslint-disable-next-line no-var
  var queryClient: QueryClient | undefined;
}


registerRootComponent(Root);
globalThis.queryClient = queryClient;
