/// <reference path="../declarations.d.ts" />
// apps/mobile/src/screens/Help.native.tsx

import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Linking,
  Pressable,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

const Card: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <View style={[tw`rounded-2xl border border-[#182430] bg-[#0f1821] p-4`, style]}>{children}</View>
);

const H1: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={tw`text-2xl font-extrabold text-white`}>{children}</Text>
);

const H2: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <Text style={[tw`text-lg font-semibold text-slate-100 mt-5 mb-2`, style]}>{children}</Text>
);

const P: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <Text style={[tw`text-slate-300 leading-6`, style]}>{children}</Text>
);

const UL: React.FC<{ items: Array<React.ReactNode | string> }> = ({ items }) => (
  <View style={tw`mt-1`}>
    {items.map((it, idx) => (
      <View key={idx} style={tw`flex-row mb-1`}>
        <Text style={tw`text-slate-400 mr-2`}>•</Text>
        <Text style={tw`flex-1 text-slate-300`}>{it as any}</Text>
      </View>
    ))}
  </View>
);

const OL: React.FC<{ items: Array<React.ReactNode | string> }> = ({ items }) => (
  <View style={tw`mt-1`}>
    {items.map((it, idx) => (
      <View key={idx} style={tw`flex-row mb-1`}>
        <Text style={tw`text-slate-400 mr-2`}>{idx + 1}.</Text>
        <Text style={tw`flex-1 text-slate-300`}>{it as any}</Text>
      </View>
    ))}
  </View>
);

const Chip: React.FC<{ label: string; onPress?: () => void; disabled?: boolean }> = ({
  label,
  onPress,
  disabled,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      tw`px-3 py-1.5 rounded-full border border-[#223246]`,
      pressed ? tw`bg-[#172534]` : tw`bg-[#0f1821]`,
      disabled ? tw`opacity-50` : null,
    ]}
  >
    <Text style={tw`text-xs text-pink-300`}>{label}</Text>
  </Pressable>
);

const Disclosure: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={tw`rounded-xl p-4 bg-[#121927] mt-2`}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={tw`flex-row items-center justify-between`}
      >
        <Text style={tw`font-medium text-slate-100`}>{title}</Text>
        <Text style={tw`text-slate-400`}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open && <View style={tw`mt-2`}>{children}</View>}
    </View>
  );
};

type AnchorKey =
  | 'quickstart'
  | 'aiTutor'
  | 'payments'
  | 'troubleshooting'
  | 'tutors'
  | 'orgs'
  | 'contact';

const HelpNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const lastUpdated = useMemo(() => new Date().toLocaleDateString(), []);
  const scrollRef = useRef<ScrollView | null>(null);
  const [anchors, setAnchors] = useState<Record<AnchorKey, number>>({
    quickstart: 0,
    aiTutor: 0,
    payments: 0,
    troubleshooting: 0,
    tutors: 0,
    orgs: 0,
    contact: 0,
  });

  const setAnchor = (key: AnchorKey) => (y: number) =>
    setAnchors((prev) => ({ ...prev, [key]: y }));

  const scrollToAnchor = (key: AnchorKey) => {
    const y = anchors[key] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
  };

  const go = (route: keyof MainStackParamList) => navigation.navigate(route as any);
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <View style={tw`flex-1 bg-[#0b1118]`}>
      {/* Header */}
      <View style={tw`px-4 pt-12 pb-4 border-b border-[#182430] bg-[#0f1821]/80`}>
        <H1>Help, FAQ & Support</H1>
        <Text style={tw`mt-1 text-slate-400 text-xs`}>Last updated: {lastUpdated}</Text>

        {/* Quick links */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={tw`mt-3`}
          contentContainerStyle={tw`gap-2`}
        >
          <Chip label="Quick Start" onPress={() => scrollToAnchor('quickstart')} />
          <Chip label="AI Tutor Studio" onPress={() => scrollToAnchor('aiTutor')} />
          <Chip label="Payments & Tokens" onPress={() => scrollToAnchor('payments')} />
          <Chip label="Troubleshooting" onPress={() => scrollToAnchor('troubleshooting')} />
          <Chip label="For Tutors" onPress={() => scrollToAnchor('tutors')} />
          <Chip label="For Organizations" onPress={() => scrollToAnchor('orgs')} />
          <Chip label="Contact Support" onPress={() => scrollToAnchor('contact')} />
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        contentContainerStyle={tw`max-w-[900px] self-center w-full px-4 py-6 pb-28`}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {}}
        scrollEventThrottle={16}
      >
        <Card>
          <P style={tw`text-slate-400`}>New here? Start with the quick guide below.</P>

          {/* QUICK START */}
          <View onLayout={(e) => setAnchor('quickstart')(e.nativeEvent.layout.y)} style={tw`mt-6`}>
            <H2>Quick Start</H2>
            <OL
              items={[
                <>
                  <Text style={tw`font-semibold`}>Create your account</Text> →{' '}
                  <Text style={tw`text-pink-400 underline`} onPress={() => go('Login' as any)}>
                    Login / Sign up
                  </Text>
                  .
                </>,
                <>
                  <Text style={tw`font-semibold`}>Complete your profile</Text> → add your learning
                  goals on{' '}
                  <Text style={tw`text-pink-400 underline`} onPress={() => go('ProfileMe' as any)}>
                    My Profile
                  </Text>
                  .
                </>,
                <>
                  <Text style={tw`font-semibold`}>Find a tutor</Text> → browse and book on{' '}
                  <Text style={tw`text-pink-400 underline`} onPress={() => go('FindTutor' as any)}>
                    Find Tutors
                  </Text>
                  .
                </>,
                <>
                  <Text style={tw`font-semibold`}>Join your session</Text> → we’ll send the meeting
                  link; use any device.
                </>,
                <>
                  Prefer self-paced? Try the{' '}
                  <Text
                    style={tw`text-pink-400 underline`}
                    onPress={() => go('RobotTeacher' as any)}
                  >
                    AI Tutor Studio
                  </Text>{' '}
                  for free lessons & quizzes.
                </>,
              ]}
            />
          </View>

          {/* AI TUTOR STUDIO */}
          <View onLayout={(e) => setAnchor('aiTutor')(e.nativeEvent.layout.y)}>
            <H2>AI Tutor Studio</H2>
            <UL
              items={[
                'Pick a topic or enter your own. We generate audio lessons, slides, and captions.',
                <>
                  Take a quiz; score ≥ <Text style={tw`font-bold`}>70%</Text> to unlock a
                  certificate (optional fee applies only if you choose to generate it).
                </>,
                'If your organization gave you an assignment link, just follow it and start.',
              ]}
            />
            <P style={tw`text-xs text-slate-400 mt-2`}>
              See also:{' '}
              <Text style={tw`text-pink-400 underline`} onPress={() => go('PaymentFlow' as any)}>
                How Payments Work
              </Text>{' '}
              •{' '}
              <Text style={tw`text-pink-400 underline`} onPress={() => go('Refunds' as any)}>
                Refund & Cancellation Policy
              </Text>
            </P>
          </View>

          {/* PAYMENTS */}
          <View onLayout={(e) => setAnchor('payments')(e.nativeEvent.layout.y)}>
            <H2>Payments & Tokens</H2>
            <UL
              items={[
                <Text>
                  <Text style={tw`font-bold`}>Tokens</Text> are store credit used for tutoring and
                  catalog purchases.
                </Text>,
                'Some prices may appear in USD or KES; taxes/fees show at checkout.',
                'Certificates are charged only when you choose to generate them.',
              ]}
            />
            <P style={tw`text-xs text-slate-400 mt-2`}>
              Policies:{' '}
              <Text style={tw`text-pink-400 underline`} onPress={() => go('Terms' as any)}>
                Terms of Service
              </Text>{' '}
              •{' '}
              <Text style={tw`text-pink-400 underline`} onPress={() => go('PrivacyPolicy' as any)}>
                Privacy Policy
              </Text>{' '}
              •{' '}
              <Text style={tw`text-pink-400 underline`} onPress={() => go('Refunds' as any)}>
                Refunds
              </Text>
            </P>
          </View>

          {/* TROUBLESHOOTING */}
          <View onLayout={(e) => setAnchor('troubleshooting')(e.nativeEvent.layout.y)}>
            <H2>Troubleshooting</H2>

            <Disclosure title="I can’t log in">
              <UL
                items={[
                  'Reset your password from the login page.',
                  'Check spam for verification or reset emails.',
                  'If the issue persists, contact us (see “Contact Support”).',
                ]}
              />
            </Disclosure>

            <Disclosure title="Audio/video issues in live sessions">
              <UL
                items={[
                  'Restart the browser or Zoom app; check mic/camera permissions.',
                  'Use a stable connection (Wi-Fi > mobile data when possible).',
                ]}
              />
            </Disclosure>

            <Disclosure title="AI quiz doesn’t load / certificate locked">
              <UL
                items={[
                  'Make sure you completed the lesson first, then generate the quiz.',
                  'Score at least 70% to unlock certificates. For org assignments, timers/locks may apply.',
                ]}
              />
            </Disclosure>
          </View>

          {/* TUTORS */}
          <View onLayout={(e) => setAnchor('tutors')(e.nativeEvent.layout.y)}>
            <H2>For Tutors</H2>
            <UL
              items={[
                <>
                  Get started at{' '}
                  <Text
                    style={tw`text-pink-400 underline`}
                    onPress={() => go('BecomeTutor' as any)}
                  >
                    Become a Tutor
                  </Text>
                  .
                </>,
                'List services accurately and deliver professionally; payouts happen after completion and verification.',
                <>
                  See{' '}
                  <Text style={tw`text-pink-400 underline`} onPress={() => go('Terms' as any)}>
                    Terms
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={tw`text-pink-400 underline`}
                    onPress={() => go('AntiSpamPolicy' as any)}
                  >
                    Anti-Spam Policy
                  </Text>
                  .
                </>,
              ]}
            />
          </View>

          {/* ORGS */}
          <View onLayout={(e) => setAnchor('orgs')(e.nativeEvent.layout.y)}>
            <H2>For Organizations</H2>
            <UL
              items={[
                <>
                  Log in to your org portal:{' '}
                  <Text style={tw`text-pink-400 underline`} onPress={() => go('OrgLogin' as any)}>
                    Institution Login
                  </Text>
                  .
                </>,
                <>
                  Provision seats and manage assignments. See{' '}
                  <Text
                    style={tw`text-pink-400 underline`}
                    onPress={() => go('FulfillmentPolicy' as any)}
                  >
                    Fulfillment & Delivery
                  </Text>{' '}
                  and MSAs/order forms.
                </>,
              ]}
            />
          </View>

          {/* CONTACT */}
          <View onLayout={(e) => setAnchor('contact')(e.nativeEvent.layout.y)}>
            <H2>Contact Support</H2>
            <View style={tw`rounded-xl p-4 bg-[#121927]`}>
              <Text style={tw`text-slate-100 font-semibold`}>EKAZICONNECT SOLUTIONS LTD</Text>
              <Text style={tw`text-slate-300`}>
                International House, Mama Ngina Street, CBD, Nairobi, Kenya
              </Text>
              <Text style={tw`text-slate-300`}>Postal: P.O. Box 1830-01000, Thika, Kenya</Text>

              <Text style={tw`text-slate-300 mt-1`}>
                Phones:{' '}
                <Text style={tw`text-pink-400 underline`} onPress={() => open('tel:+254728872800')}>
                  +254 728 872 800
                </Text>{' '}
                •{' '}
                <Text style={tw`text-pink-400 underline`} onPress={() => open('tel:+254720423764')}>
                  +254 720 423 764
                </Text>{' '}
                •{' '}
                <Text style={tw`text-pink-400 underline`} onPress={() => open('tel:+254758276900')}>
                  +254 758 276 900
                </Text>
              </Text>

              <Text style={tw`text-slate-300`}>
                Email:{' '}
                <Text
                  style={tw`text-pink-400 underline`}
                  onPress={() =>
                    open(
                      'mailto:support@daybreaklearner.com?subject=Support%20Request&body=Hi%20Daybreak%20Support%2C%0A%0AMy%20issue%3A%20'
                    )
                  }
                >
                  support@daybreaklearner.com
                </Text>
              </Text>

              <Text style={tw`text-xs text-slate-400 mt-2`}>
                You can also leave structured feedback here:{' '}
                <Text
                  style={tw`text-pink-400 underline`}
                  onPress={() => go('ComplaintsFeedback' as any)}
                >
                  Complaints & Feedback
                </Text>
                .
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

export default HelpNative;
