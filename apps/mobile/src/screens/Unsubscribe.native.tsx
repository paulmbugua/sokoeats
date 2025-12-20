// apps/mobile/src/pages/Unsubscribe.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';

type State = 'idle' | 'working' | 'done' | 'error';

type UnsubscribeRoute = RouteProp<MainStackParamList, 'Unsubscribe'>;

export default function UnsubscribePageNative() {
  const { backendUrl } = useShopContext();
  const route = useRoute<UnsubscribeRoute>();

  // Accept params via navigation (preferred on native)
  const routeEmail = route?.params?.e ?? route?.params?.email ?? null;
  const routeToken = route?.params?.t ?? route?.params?.token ?? null;

  // Manual entry state
  const [state, setState] = useState<State>('idle');
  const [email, setEmail] = useState(routeEmail ?? '');

  // Whether we have a tokenized flow (deep link / routed)
  const hasTokenFlow = useMemo(() => Boolean(routeEmail && routeToken), [routeEmail, routeToken]);

  // Kick off unsubscribe automatically if we have tokenized inputs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasTokenFlow) return;

      setState('working');
      try {
        const r = await fetch(
          `${backendUrl}/api/email/unsubscribe?e=${encodeURIComponent(routeEmail!)}&t=${encodeURIComponent(routeToken!)}`
        );
        if (!cancelled) setState(r.ok ? 'done' : 'error');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, hasTokenFlow, routeEmail, routeToken]);

  /* ------------------------------ Render states ----------------------------- */

  // Success (covers both token flow and manual form)
  if (state === 'done') {
    return (
      <View className="flex-1 bg-white dark:bg-slate-900">
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View className="mx-auto w-full max-w-md">
            <Text className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
              You’re unsubscribed
            </Text>
            <Text className="text-slate-600 dark:text-slate-300">
              We won’t email you again unless you opt back in.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Tokenized link flow status (auto-processing)
  if (hasTokenFlow) {
    return (
      <View className="flex-1 bg-white dark:bg-slate-900">
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View className="mx-auto w-full max-w-md">
            <Text className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Updating your preferences…
            </Text>
            {state === 'error' && (
              <Text className="text-red-600">
                Failed to unsubscribe. Please try the form below.
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // Manual form
  return (
    <View className="flex-1 bg-white dark:bg-slate-900">
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View className="mx-auto w-full max-w-md">
          <Text className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
            Unsubscribe
          </Text>
          <Text className="text-slate-600 dark:text-slate-300 mb-4">
            Enter your email to stop receiving messages from us.
          </Text>

          <View className="mb-3">
            <TextInput
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Platform.OS === 'ios' ? '#95a3b7' : '#7a8aa0'}
              className="w-full rounded-lg px-3 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
            />
          </View>

          <Pressable
            onPress={async () => {
              if (!email) return;
              setState('working');
              try {
                const r = await fetch(`${backendUrl}/api/email/unsubscribe`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email }),
                });
                setState(r.ok ? 'done' : 'error');
              } catch {
                setState('error');
              }
            }}
            disabled={state === 'working'}
            className={`w-full rounded-lg px-4 py-3 items-center ${state === 'working' ? 'bg-indigo-600/60' : 'bg-indigo-600'} `}
          >
            <Text className="text-white font-semibold">
              {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe'}
            </Text>
          </Pressable>

          {state === 'error' && (
            <Text className="text-red-600 mt-3">Something went wrong. Please try again.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
