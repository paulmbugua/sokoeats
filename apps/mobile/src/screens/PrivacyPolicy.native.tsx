// apps/mobile/src/pages/PrivacyPolicy.native.tsx
import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../navigation/types';

type Nav = StackNavigationProp<MainStackParamList>;

export default function PrivacyPolicy() {
  const navigation = useNavigation<Nav>();

  const openUrl = (url: string) => Linking.openURL(url).catch(() => {});
  const openMail = (email: string, subject?: string) =>
    Linking.openURL(
      `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
    ).catch(() => {});
  const openTel = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => {});

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-900"
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View className="max-w-[900px] w-full self-center px-4 py-10">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">Privacy Policy</Text>
        <Text className="text-slate-500 dark:text-slate-400 mt-1">
          Last updated: {new Date().toLocaleDateString()}
        </Text>

        <View className="mt-6">
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300">
            This Privacy Policy explains how <Text className="font-semibold">Daybreak Learn</Text> (
            <Pressable onPress={() => openUrl('https://www.daybreaklearner.com')}>
              <Text className="text-blue-600 dark:text-blue-400 underline">
                daybreaklearner.com
              </Text>
            </Pressable>
            ) operated by <Text className="font-semibold">EKAZICONNECT SOLUTIONS LTD</Text> (“we”,
            “us”, “our”) collects, uses, and protects your information when you use our platform for
            live tutoring, tutor-published videos/courses, and AI learning (lessons, quizzes,
            certificates).
          </Text>

          <SectionTitle>1) Information we collect</SectionTitle>
          <View className="mt-1 pl-4">
            <Bullet>
              <Text className="font-semibold">Account &amp; Identity</Text>: name, email, password
              (hashed), role (student/tutor/institution admin).
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Contact</Text>: phone numbers you provide.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Profile &amp; Content</Text>: subjects, bio, uploaded
              media, course/video listings (tutors), certificates.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Transactional</Text>: purchases, token balance,
              bookings, completions, refunds; limited payment metadata. (We do{' '}
              <Text className="italic">not</Text> store full card details—handled by our
              processors.)
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Usage/Device</Text>: pages viewed, features used,
              approximate location, device/browser data, cookies.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Communications</Text>: messages with support or
              tutors, feedback/complaints.
            </Bullet>
          </View>

          <SectionTitle>2) How we use your information</SectionTitle>
          <View className="mt-1 pl-4">
            <Bullet>
              Provide and improve our services (sessions, videos/courses, AI learning and quizzes).
            </Bullet>
            <Bullet>
              Process payments, tokens, bookings, tutor payouts, and institution subscriptions.
            </Bullet>
            <Bullet>
              Prevent fraud and abuse, secure accounts, and enforce our{' '}
              <Pressable onPress={() => navigation.navigate('TermsOfService')}>
                <Text className="text-blue-600 dark:text-blue-400 underline">Terms</Text>
              </Pressable>
              .
            </Bullet>
            <Bullet>
              Send transactional notices (receipts, booking updates, certificate ready).
            </Bullet>
            <Bullet>
              With your consent, send product updates/marketing (you can opt out anytime).
            </Bullet>
            <Bullet>Comply with legal obligations and resolve disputes.</Bullet>
          </View>

          <SectionTitle>3) Legal bases (where applicable)</SectionTitle>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            Contract (providing the service), Legitimate interests (security, improvement), Consent
            (marketing, some cookies), Legal obligation (records, compliance).
          </Text>

          <SectionTitle>4) Sharing &amp; disclosure</SectionTitle>
          <View className="mt-1 pl-4">
            <Bullet>
              <Text className="font-semibold">Processors</Text>: hosting, analytics, email/SMS,
              payments (e.g., PayPal/M-Pesa), customer support tools.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Tutors</Text>: when you book/buy, tutors see the
              details needed to deliver the service.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Institutions</Text>: if your seat is provided by an
              institution, relevant learning/certificate data may be visible to its admins.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Legal</Text>: to comply with law, prevent fraud, or
              protect rights.
            </Bullet>
          </View>

          <SectionTitle>5) International transfers</SectionTitle>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            Your data may be processed outside your country. We use reasonable safeguards (e.g.,
            contractual protections, encryption in transit).
          </Text>

          <SectionTitle>6) Retention</SectionTitle>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            We keep data while your account is active and as required for legal/accounting purposes.
            Financial records may be retained up to seven (7) years.
          </Text>

          <SectionTitle>7) Your rights</SectionTitle>
          <View className="mt-1 pl-4">
            <Bullet>Access, correction, deletion (subject to legal limits).</Bullet>
            <Bullet>
              Objection/restriction to certain processing; data portability where applicable.
            </Bullet>
            <Bullet>Withdraw consent (for marketing) at any time.</Bullet>
            <Bullet>Complain to your local data protection authority.</Bullet>
          </View>

          <SectionTitle>8) Children</SectionTitle>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            Our services are intended for learners with parental/guardian consent when required by
            law. We do not knowingly collect data from children under 13 without appropriate
            consent.
          </Text>

          <SectionTitle>9) Cookies</SectionTitle>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-300 mt-1">
            We use cookies to keep you signed in, remember preferences, and analyze usage. You can
            control cookies via your browser. Some features may not work without essential cookies.
          </Text>

          <SectionTitle>10) Contact</SectionTitle>
          <View className="rounded-md p-4 bg-slate-50 dark:bg-[#121927]">
            <Text className="text-sm text-slate-900 dark:text-white font-semibold">
              EKAZICONNECT SOLUTIONS LTD
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              Registered Office: International House, Mama Ngina Street, CBD, Nairobi, Kenya
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-300">
              Postal: P.O. Box 1830-01000, Thika, Kenya
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              Phones:{' '}
              <Pressable onPress={() => openTel('+254728872800')}>
                <Text className="text-blue-600 dark:text-blue-400">+254 728 872 800</Text>
              </Pressable>{' '}
              •{' '}
              <Pressable onPress={() => openTel('+254720423764')}>
                <Text className="text-blue-600 dark:text-blue-400">+254 720 423 764</Text>
              </Pressable>{' '}
              •{' '}
              <Pressable onPress={() => openTel('+254758276900')}>
                <Text className="text-blue-600 dark:text-blue-400">+254 758 276 900</Text>
              </Pressable>
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              Email:{' '}
              <Pressable onPress={() => openMail('privacy@daybreaklearner.com')}>
                <Text className="text-blue-600 dark:text-blue-400">
                  privacy@daybreaklearner.com
                </Text>
              </Pressable>{' '}
              /{' '}
              <Pressable onPress={() => openMail('support@daybreaklearner.com')}>
                <Text className="text-blue-600 dark:text-blue-400">
                  support@daybreaklearner.com
                </Text>
              </Pressable>
            </Text>
          </View>

          <View className="mt-3">
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              See also:{' '}
              <Pressable onPress={() => navigation.navigate('AntiSpamPolicy')}>
                <Text className="text-blue-600 dark:text-blue-400">Anti-Spam Policy</Text>
              </Pressable>{' '}
              •{' '}
              <Pressable onPress={() => navigation.navigate('ComplaintsFeedback')}>
                <Text className="text-blue-600 dark:text-blue-400">Complaints &amp; Feedback</Text>
              </Pressable>
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/* ------------------------------ UI helpers ------------------------------ */

const SectionTitle: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <Text className="text-lg font-semibold text-slate-900 dark:text-white mt-5">{children}</Text>
);

const Bullet: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <View className="flex-row items-start mb-2">
    <Text className="text-slate-500 dark:text-slate-400 mr-2">{'\u2022'}</Text>
    <Text className="flex-1 text-sm leading-6 text-slate-700 dark:text-slate-300">{children}</Text>
  </View>
);
