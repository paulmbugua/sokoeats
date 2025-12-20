/// <reference path="../declarations.d.ts" />

import React, { useMemo } from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={tw`rounded-2xl border border-[#182430] bg-[#0f1821] p-4`}>{children}</View>
);

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={tw`text-lg font-semibold text-slate-100 mt-5 mb-2`}>{children}</Text>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={tw`text-slate-300 leading-6`}>{children}</Text>
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

const TermsOfServiceNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const lastUpdated = useMemo(() => new Date().toLocaleDateString(), []);

  const go = (route: keyof MainStackParamList) => navigation.navigate(route as any);
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <View style={tw`flex-1 bg-[#0b1118]`}>
      {/* Header */}
      <View style={tw`px-4 pt-12 pb-4 border-b border-[#182430] bg-[#0f1821]/80`}>
        <Text style={tw`text-2xl font-extrabold text-white`}>Terms of Service</Text>
        <Text style={tw`mt-1 text-slate-400 text-xs`}>Last updated: {lastUpdated}</Text>
      </View>

      {/* Content */}
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`max-w-[900px] self-center w-full px-4 py-6 pb-28`}
      >
        <Card>
          <P>
            Welcome to <Text style={tw`font-bold`}>Daybreak Learn</Text>. These Terms form a binding
            agreement between you and <Text style={tw`font-bold`}>EKAZICONNECT SOLUTIONS LTD</Text>.
            By using our website or apps, you agree to these Terms.
          </P>

          <H2>1) Services</H2>
          <UL
            items={[
              'Live online tutoring sessions.',
              'Tutor-published videos and courses purchasable from our catalog.',
              'AI learning: lessons, quizzes, and optional paid certificates.',
              'Institutional subscriptions for organizations.',
            ]}
          />

          <H2>2) Accounts & eligibility</H2>
          <P>
            You must provide accurate information and keep credentials secure. You are responsible
            for activity under your account.
          </P>

          <H2>3) Tokens & payments</H2>
          <UL
            items={[
              '“Tokens” are store credit used to purchase services on Daybreak Learn.',
              <Text>
                Tokens are <Text style={tw`font-bold`}>non-transferable</Text> and{' '}
                <Text style={tw`font-bold`}>not redeemable for cash</Text>.
              </Text>,
              'Prices, taxes, and fees are shown at checkout. Some services may be priced in USD or KES.',
              'Certificates are charged only when you choose to generate them.',
            ]}
          />
          <P>
            Refunds and cancellations are governed by our{' '}
            <Text
              style={tw`text-pink-400 underline`}
              onPress={() => go('RefundsAndCancellations' as any)}
            >
              Refund & Cancellation Policy
            </Text>
            .
          </P>

          <H2>4) Live sessions; videos/courses</H2>
          <P>
            For live sessions, we place a token hold and capture upon completion. Video/course
            purchases grant streaming access immediately after payment.
          </P>

          <H2>5) Tutors</H2>
          <UL
            items={[
              'Tutors must provide accurate listings and deliver services professionally.',
              'Payouts occur after completion and any required verification, minus platform fees.',
              'Tutors are responsible for applicable taxes and compliance in their jurisdictions.',
            ]}
          />

          <H2>6) Institutional plans</H2>
          <P>
            Institutions may subscribe for seats; provisioning and billing terms are described in
            our{' '}
            <Text
              style={tw`text-pink-400 underline`}
              onPress={() => go('FulfillmentPolicy' as any)}
            >
              Fulfillment Policy
            </Text>{' '}
            and order forms or MSAs.
          </P>

          <H2>7) Acceptable use</H2>
          <UL
            items={[
              'No harassment, hate speech, IP infringement, or unlawful activity.',
              <Text>
                No spamming or unsolicited marketing—see our{' '}
                <Text
                  style={tw`text-pink-400 underline`}
                  onPress={() => go('AntiSpamPolicy' as any)}
                >
                  Anti-Spam Policy
                </Text>
                .
              </Text>,
              'No attempts to bypass security, scrape at scale, or interfere with the service.',
            ]}
          />

          <H2>8) Content & IP</H2>
          <UL
            items={[
              'You retain rights to your uploads. You grant us a license to host, stream, and display them on the platform.',
              'Do not upload content you don’t have rights to. We honor reasonable takedown requests.',
              'Our trademarks, brand, and code are protected; do not misuse them.',
            ]}
          />

          <H2>9) Disclaimers</H2>
          <P>
            Services are provided “as is” without warranties. We do not guarantee outcomes, grades,
            or results.
          </P>

          <H2>10) Limitation of liability</H2>
          <P>
            To the fullest extent permitted by law, our liability is limited to the amount you paid
            for the service giving rise to the claim.
          </P>

          <H2>11) Termination</H2>
          <P>
            We may suspend or terminate accounts for violations. You may stop using the services at
            any time.
          </P>

          <H2>12) Governing law; disputes</H2>
          <P>
            Kenyan law governs these Terms. We encourage good-faith resolution first; courts in
            Kenya have jurisdiction, without prejudice to any consumer rights you hold.
          </P>

          <H2>13) Changes</H2>
          <P>We may update these Terms; continued use means you accept the updated terms.</P>

          <H2>14) Contact</H2>
          <View style={tw`rounded-xl p-4 bg-[#121927] mt-2`}>
            <Text style={tw`text-slate-100 font-semibold`}>EKAZICONNECT SOLUTIONS LTD</Text>
            <Text style={tw`text-slate-300`}>
              International House, Mama Ngina Street, CBD, Nairobi, Kenya
            </Text>
            <Text style={tw`text-slate-300`}>Postal: P.O. Box 1830-01000, Thika, Kenya</Text>
            <Text style={tw`text-slate-300`}>
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
                onPress={() => open('mailto:support@daybreaklearner.com')}
              >
                support@daybreaklearner.com
              </Text>
            </Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

export default TermsOfServiceNative;
