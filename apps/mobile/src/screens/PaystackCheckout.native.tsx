/* eslint-disable prettier/prettier */
import React, { useMemo, useCallback } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import tw from '../../tailwind';
import type { MainStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

type PaystackCheckoutRoute = RouteProp<MainStackParamList, 'PaystackCheckout'>;
type Nav = StackNavigationProp<MainStackParamList>;

export default function PaystackCheckoutNative() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<PaystackCheckoutRoute>();

  const authorizationUrl = String(route.params?.authorizationUrl || '').trim();
  const reference = String(route.params?.reference || '').trim();
  const kind = route.params?.kind;
  const paymentId = route.params?.paymentId;

  const shouldCloseUrls = useMemo(
    () => ({
      close3ds: 'https://standard.paystack.co/close',
      deepPrefix: 'daybreak://paystack/callback',
    }),
    [],
  );

  const finish = useCallback(
    (hitUrl?: string) => {
      navigation.replace('PaystackCallback', {
        reference,
        kind,
        paymentId,
      });
    },
    [navigation, reference, kind, paymentId],
  );

  if (!authorizationUrl || !reference) {
    return (
      <SafeAreaView style={tw`flex-1 items-center justify-center bg-white dark:bg-[#0b1016]`}>
        <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>
          Missing Paystack checkout details.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-white dark:bg-[#0b1016]`}>
      <WebView
        source={{ uri: authorizationUrl }}
        startInLoadingState
        renderLoading={() => (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator />
            <Text style={tw`mt-3 text-sm text-[#49739c] dark:text-white/70`}>
              Loading Paystack…
            </Text>
          </View>
        )}
        onNavigationStateChange={(nav) => {
          const url = String(nav?.url || '');
          if (!url) return;

          if (url.startsWith(shouldCloseUrls.close3ds)) {
            finish(url);
            return;
          }

          if (url.startsWith(shouldCloseUrls.deepPrefix)) {
            finish(url);
            return;
          }
        }}
      />
    </SafeAreaView>
  );
}
