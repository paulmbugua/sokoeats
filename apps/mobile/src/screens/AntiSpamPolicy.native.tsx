// apps/mobile/src/pages/AntiSpamPolicy.native.tsx
import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

export default function AntiSpamPolicy() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();

  const openMail = (email: string, subject?: string) => {
    const s = subject ? `?subject=${encodeURIComponent(subject)}` : '';
    Linking.openURL(`mailto:${email}${s}`).catch(() => {});
  };

  const openTel = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-900"
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View className="max-w-[900px] w-full self-center px-4 py-10">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">Anti-Spam Policy</Text>
        <Text className="text-slate-500 dark:text-slate-400 mt-1">
          Last updated: {new Date().toLocaleDateString()}
        </Text>

        <View className="mt-6 space-y-5">
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300">
            We prohibit unsolicited or abusive messaging on and off the DayBreak Learn platform.
            This policy applies to emails, SMS, in-app messages, and tutor/student communications.
          </Text>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-2">
            1) Consent first
          </Text>
          <View className="pl-4 mt-1">
            <Bulleted>
              We send <Text className="font-semibold">transactional</Text> messages (receipts,
              booking updates, passwords) without marketing content.
            </Bulleted>
            <Bulleted>
              We send <Text className="font-semibold">marketing</Text> messages only with your
              consent; every message includes a clear unsubscribe or opt-out.
            </Bulleted>
            <Bulleted>
              Tutors may message only learners who have interacted with their listings or sessions
              and strictly about learning.
            </Bulleted>
          </View>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-4">
            2) Prohibited content & practices
          </Text>
          <View className="pl-4 mt-1">
            <Bulleted>
              Purchased/harvested lists, bulk cold emails, misleading headers, or deceptive subject
              lines.
            </Bulleted>
            <Bulleted>
              Scams, illegal products, hate, harassment, adult content, or malware.
            </Bulleted>
            <Bulleted>Sending frequency or volume that causes complaints or blocks.</Bulleted>
          </View>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-4">
            3) Compliance
          </Text>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            We aim to comply with applicable anti-spam and consumer laws. We monitor
            bounce/complaint rates and may rate-limit, warn, or suspend accounts.
          </Text>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-4">
            4) Report abuse
          </Text>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            Forward suspicious messages to{' '}
            <Pressable onPress={() => openMail('abuse@daybreaklearner.com', 'Spam report')}>
              <Text className="text-blue-600 dark:text-blue-400">abuse@daybreaklearner.com</Text>
            </Pressable>{' '}
            with headers if possible. We investigate promptly.
          </Text>

          <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-4">
            5) Contact
          </Text>
          <View className="rounded-md p-4 bg-slate-50 dark:bg-[#121927]">
            <Text className="text-sm text-slate-900 dark:text-white font-semibold">
              EKAZICONNECT SOLUTIONS LTD
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              International House, Mama Ngina Street, CBD, Nairobi, Kenya
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-300">
              Postal: P.O. Box 1830-01000, Thika, Kenya
            </Text>

            <Text className="text-sm text-slate-700 dark:text-slate-300 mt-2">Phones:</Text>
            <View className="flex-row flex-wrap gap-x-2 mt-1">
              <InlineLink onPress={() => openTel('+254728872800')}>+254 728 872 800</InlineLink>
              <Text className="text-slate-500">•</Text>
              <InlineLink onPress={() => openTel('+254720423764')}>+254 720 423 764</InlineLink>
              <Text className="text-slate-500">•</Text>
              <InlineLink onPress={() => openTel('+254758276900')}>+254 758 276 900</InlineLink>
            </View>

            <View className="mt-2">
              <Text className="text-sm text-slate-700 dark:text-slate-300">
                Email:{' '}
                <Pressable onPress={() => openMail('support@daybreaklearner.com')}>
                  <Text className="text-blue-600 dark:text-blue-400">
                    support@daybreaklearner.com
                  </Text>
                </Pressable>
              </Text>
            </View>
          </View>

          <View className="mt-4">
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              See also:{' '}
              <Pressable onPress={() => navigation.navigate('PrivacyPolicy')}>
                <Text className="text-blue-600 dark:text-blue-400">Privacy Policy</Text>
              </Pressable>{' '}
              •{' '}
              <Pressable onPress={() => navigation.navigate('TermsOfService')}>
                <Text className="text-blue-600 dark:text-blue-400">Terms of Service</Text>
              </Pressable>
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const Bulleted: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <View className="flex-row items-start mb-2">
    <Text className="text-slate-500 dark:text-slate-400 mr-2">{'\u2022'}</Text>
    <Text className="flex-1 text-sm leading-6 text-slate-700 dark:text-slate-300">{children}</Text>
  </View>
);

const InlineLink: React.FC<{ onPress: () => void; children: React.ReactNode }> = ({
  onPress,
  children,
}) => (
  <Pressable onPress={onPress}>
    <Text className="text-blue-600 dark:text-blue-400 text-sm">{children}</Text>
  </Pressable>
);
