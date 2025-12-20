// apps/mobile/src/pages/FulfillmentPolicy.native.tsx
import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

export default function FulfillmentPolicy() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();

  const openMail = (email: string, subject?: string) => {
    const s = subject ? `?subject=${encodeURIComponent(subject)}` : '';
    Linking.openURL(`mailto:${email}${s}`).catch(() => {});
  };

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-900"
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View className="max-w-[900px] w-full self-center px-4 py-10">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
          Fulfillment & Delivery Policy
        </Text>
        <Text className="text-slate-500 dark:text-slate-400 mt-1">
          Last updated: {new Date().toLocaleDateString()}
        </Text>

        <View className="mt-6">
          <Text className="text-lg font-semibold text-slate-900 dark:text-white">
            1) What you receive
          </Text>
          <View className="mt-2 pl-4">
            <Bullet>
              <Text className="font-semibold">Tokens</Text> (store credit) immediately after
              confirmed payment.
            </Bullet>
            <Bullet>
              Access to book <Text className="font-semibold">live online tutoring</Text>.
            </Bullet>
            <Bullet>
              Streaming access to{' '}
              <Text className="font-semibold">tutor-published videos and courses</Text> purchased
              directly from the catalog.
            </Bullet>
            <Bullet>
              Access to <Text className="font-semibold">AI learning</Text> (lessons, quizzes).
              Certificates are optional and paid only when generated.
            </Bullet>
          </View>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-5">
            2) Token delivery
          </Text>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            Tokens appear instantly after payment is confirmed. If you don’t see them, contact
            support with your receipt.
          </Text>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-5">
            3) Booking & joining live sessions
          </Text>
          <View className="mt-2 pl-4">
            <Bullet>Choose a tutor/time; we place a hold on the required Tokens.</Bullet>
            <Bullet>Sessions run online via a meeting link in your dashboard and email.</Bullet>
            <Bullet>Please join a few minutes early to test audio/video.</Bullet>
          </View>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-5">
            4) On-demand purchases (videos/courses)
          </Text>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            Streaming access is granted immediately in your library. Some items may include
            downloadable notes; any downloads are watermarked.
          </Text>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-5">
            5) Completion & payouts
          </Text>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            After a live session, you or the tutor mark it complete. If no issue is reported within
            24 hours, it auto-completes. We then capture Tokens, retain the platform fee, and{' '}
            <Text className="font-semibold">release tutor payouts</Text> (typically 24–72h) via the
            tutor’s selected method (e.g., M-Pesa or PayPal).
          </Text>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-5">
            6) Institutional subscriptions
          </Text>
          <View className="mt-2 pl-4">
            <Bullet>
              We provision seats to the institution’s admin within 1–2 business days of payment or
              PO acceptance.
            </Bullet>
            <Bullet>
              Admins assign seats to learners/staff; SSO/invite links may be provided.
            </Bullet>
            <Bullet>
              Bulk onboarding, reporting, and certificate verification pages are available on
              request.
            </Bullet>
          </View>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-5">
            7) Receipts & invoices
          </Text>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            Receipts live in your account. For company invoices, email{' '}
            <Pressable onPress={() => openMail('billing@daybreaklearner.com', 'Invoice request')}>
              <Text className="text-blue-600 dark:text-blue-400">billing@daybreaklearner.com</Text>
            </Pressable>
            .
          </Text>

          <View className="rounded-md p-4 bg-slate-50 dark:bg-[#121927] mt-4">
            <Text className="text-xs text-slate-700 dark:text-slate-300">
              <Text className="font-semibold">Note:</Text> Tokens are non-transferable and not
              redeemable for cash. See our{' '}
              <Pressable onPress={() => navigation.navigate('RefundsAndCancellations')}>
                <Text className="text-blue-600 dark:text-blue-400">
                  Refund & Cancellation Policy
                </Text>
              </Pressable>
              .
            </Text>
          </View>

          <View className="mt-6">
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              See also:{' '}
              <Pressable onPress={() => navigation.navigate('PaymentFlow')}>
                <Text className="text-blue-600 dark:text-blue-400">How Payments Work</Text>
              </Pressable>
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const Bullet: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <View className="flex-row items-start mb-2">
    <Text className="text-slate-500 dark:text-slate-400 mr-2">{'\u2022'}</Text>
    <Text className="flex-1 text-sm leading-6 text-slate-700 dark:text-slate-300">{children}</Text>
  </View>
);
