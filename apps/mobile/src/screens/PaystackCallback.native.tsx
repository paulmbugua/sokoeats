/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import tw from '../../tailwind';
import { useShopContext } from '@myhandymanapp/shared/context';
import { paystackVerify, paystackVerifyBooking } from '@myhandymanapp/shared/api/paymentApi';
import type { MainStackParamList } from '../navigation/types';

type Status = 'verifying' | 'success' | 'failed';
type R = RouteProp<MainStackParamList, 'PaystackCallback'>;

/* ----------------------- AsyncStorage helpers ----------------------- */

async function safeSet(key: string, val: string) {
  try {
    await AsyncStorage.setItem(key, val);
  } catch {}
}

function looksLikeJwt(s: string) {
  const t = String(s || '').trim();
  return t.startsWith('eyJ') && t.split('.').length === 3;
}

async function fetchWalletBalance(backendUrl: string, authToken: string): Promise<number | null> {
  if (!backendUrl || !authToken) return null;
  try {
    const url = `${backendUrl.replace(/\/+$/, '')}/api/account/balance`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
    if (!r.ok) return null;
    const j = await r.json();

    const bal = Number(j?.balance ?? j?.tokens ?? j?.data?.balance ?? j?.data?.tokens ?? NaN);
    return Number.isFinite(bal) ? bal : null;
  } catch {
    return null;
  }
}

function emitWalletUpdated(balance: number) {
  // persist + broadcast (native equivalent of window.dispatchEvent)
  safeSet('wallet:lastBalance', String(balance));
  try {
    DeviceEventEmitter.emit('wallet:updated', { balance });
  } catch {}
}

function resolveFlowNative(params: any) {
  const kind = String(params?.kind || '').toLowerCase();
  return {
    kind,
    isBooking: kind === 'booking',
    bookingId: String(params?.bookingId || '').trim(),
    jobId: String(params?.jobId || '').trim(),
    quoteId: String(params?.quoteId || '').trim(),
  };
}

function pickReference(obj: any) {
  const r = String(obj?.reference || obj?.trxref || '').trim();
  return r || '';
}

/* ----------------------- Screen ----------------------- */

export default function PaystackCallbackNative() {
  const navigation = useNavigation<any>();
  const route = useRoute<R>();
  const insets = useSafeAreaInsets();

  const { backendUrl, token } = (useShopContext() as any) ?? {};
  const pkgToken = String(token || '').trim();

  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('Finishing payment…');

  const [reference, setReference] = useState<string>('');
  const [kind, setKind] = useState<string>('');
  const [bookingParams, setBookingParams] = useState<{ bookingId?: string; jobId?: string; quoteId?: string }>({});

  const [retryTick, setRetryTick] = useState(0);

  const padTop = Math.max(insets.top, 12);
  const padBottom = Math.max(insets.bottom, 16);

  useEffect(() => {
    (async () => {
      const initial = await Linking.getInitialURL();
      console.log('[PAYSTACK][initialURL]', initial);
    })();

    const sub = Linking.addEventListener('url', ({ url }) => {
      console.log('[PAYSTACK][eventURL]', url);
    });

    return () => sub.remove();
  }, []);

  // Resolve reference + flow from route params OR deep link
  useEffect(() => {
    let alive = true;

    (async () => {
      // Prefer params
      const p = route.params ?? {};

      // If app was opened via deep link, expo-linking parses it for us too
      let deepParams: any = {};
      try {
        const url = await Linking.getInitialURL();
        if (url) deepParams = (Linking.parse(url)?.queryParams ?? {}) as any;
      } catch {}

      const merged = { ...(deepParams || {}), ...(p as any) };

      const ref = pickReference(merged);
      const flow = resolveFlowNative(merged);

      if (!alive) return;

      setReference(ref);
      setKind(flow.kind || '');
      setBookingParams({ bookingId: flow.bookingId, jobId: flow.jobId, quoteId: flow.quoteId });
    })();

    return () => {
      alive = false;
    };
  }, [route.params]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      try {
        const qp = Linking.parse(url)?.queryParams ?? {};
        const merged = { ...(route.params ?? {}), ...(qp as any) };

        const ref = pickReference(merged);
        const flow = resolveFlowNative(merged);
        setReference(ref);
        setKind(flow.kind || '');
        setBookingParams({ bookingId: flow.bookingId, jobId: flow.jobId, quoteId: flow.quoteId });
      } catch {}
    });

    return () => sub.remove();
  }, [route.params]);

  const retry = () => {
    setStatus('verifying');
    setMessage('Retrying confirmation…');
    setRetryTick((x) => x + 1);
  };

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });

  // Main verify effect (matches web logic; never mixes tokens)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setStatus('verifying');
        setMessage('Finishing payment…');

        if (!reference || looksLikeJwt(reference)) {
          setStatus('failed');
          setMessage('Missing Paystack reference in callback URL.');
          return;
        }

        // ==============================
        // BOOKING FLOW (uses client token)
        // ==============================
        if (kind === 'booking') {
          if (!pkgToken) {
            setStatus('failed');
            setMessage('You must be logged in to confirm this booking payment.');
            return;
          }
          const result = await paystackVerifyBooking(backendUrl, reference, pkgToken);
          if (!result?.ok || result.status !== 'success') {
            setStatus('failed');
            setMessage(result?.message || 'Booking payment was not completed.');
            return;
          }
          if (!alive) return;
          const bookingId = result.bookingId || bookingParams.bookingId || '';
          const jobId = result.jobId || bookingParams.jobId || '';
          const quoteId = result.quoteId || bookingParams.quoteId || '';
          setStatus('success');
          setMessage('Payment verified. Booking confirmed.');
          setTimeout(() => {
            if (!alive) return;
            navigation.reset({ index: 0, routes: [{ name: 'BookingConfirmed', params: { bookingId, jobId, quoteId } }] });
          }, 650);
          return;
        }

        // ==============================
        // TOKEN / PACKAGE FLOW (uses token ONLY)
        // ==============================
        if (!pkgToken) {
          setStatus('failed');
          setMessage('You must be logged in to verify a token purchase.');
          return;
        }

        // ✅ Correct arg order: (backendUrl, reference, token)
        await paystackVerify(backendUrl, reference, pkgToken);

        // Refresh + broadcast wallet so Account updates instantly
        const bal = await fetchWalletBalance(backendUrl, pkgToken);
        if (bal != null) emitWalletUpdated(bal);

        if (!alive) return;
        setStatus('success');
        setMessage('Payment verified ✅ Redirecting to your account…');

        // optional breadcrumb for your Account screen to react to
        await safeSet('paystack:after', JSON.stringify({ at: Date.now(), focus: 'tokens' }));
        setTimeout(() => {
          if (!alive) return;
          goHome();
        }, 650);
      } catch (e: any) {
        if (!alive) return;
        setStatus('failed');

        if (kind === 'booking') {
          setMessage(
            e?.response?.data?.message || e?.message || 'Booking payment verification failed.'
          );
        } else {
          setMessage(
            e?.response?.data?.message || e?.message || 'Token payment verification failed.'
          );
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [backendUrl, reference, pkgToken, retryTick, kind, bookingParams, navigation]);

  const flowLabel = useMemo(() => (kind === 'booking' ? 'Booking payment' : 'Token top-up'), [kind]);

  const cardBorder = 'border border-[#e2edf5] dark:border-white/10';
  const cardBg = 'bg-white dark:bg-[#0f1821]';

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
      {/* Soft background orbs (same vibe as FindTutor) */}
      <View style={tw`absolute inset-0`}>
        <View
          style={tw`absolute -top-16 -right-10 h-36 w-36 rounded-full bg-pink-500/12 dark:bg-pink-500/10`}
        />
        <View
          style={tw`absolute -bottom-24 -left-20 h-44 w-44 rounded-full bg-sky-500/10 dark:bg-sky-500/10`}
        />
      </View>

      <View
        style={[
          tw`flex-1 items-center justify-center px-5`,
          { paddingTop: padTop, paddingBottom: padBottom },
        ]}
      >
        <View style={tw.style(`w-full max-w-[520px] rounded-2xl p-5 ${cardBg} ${cardBorder}`)}>
          <Text style={tw`text-lg font-extrabold text-[#0d141c] dark:text-white`}>
            Paystack callback{' '}
            <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/60`}>
              ({flowLabel})
            </Text>
          </Text>

          <View style={tw`mt-3 flex-row items-center`}>
            {status === 'verifying' ? (
              <>
                <ActivityIndicator />
                <Text style={tw`ml-3 text-sm text-[#49739c] dark:text-white/70`}>
                  Status: <Text style={tw`font-extrabold`}>{status}</Text>
                </Text>
              </>
            ) : (
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>
                Status: <Text style={tw`font-extrabold`}>{status}</Text>
              </Text>
            )}
          </View>

          <Text style={tw`mt-2 text-sm text-[#0d141c] dark:text-white/90`}>{message}</Text>

          {/* Buttons (never mix links) */}
          <View style={tw`mt-4 flex-row flex-wrap gap-2`}>
            <Pressable
              onPress={goHome}
              style={tw`px-3 py-2 rounded-xl bg-slate-900 dark:bg-white/10`}
            >
              <Text style={tw`text-sm font-bold text-white`}>Go to Home</Text>
            </Pressable>

            {status === 'failed' ? (
              <Pressable
                onPress={retry}
                style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-white/10`}
              >
                <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>
                  Retry confirmation
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={goHome}
              style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-white/10`}
            >
              <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>Home</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
}
