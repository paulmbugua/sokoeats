/// <reference path="../declarations.d.ts" />

import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
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

const RefundsAndCancellationsNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const lastUpdated = useMemo(() => new Date().toLocaleDateString(), []);

  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <View style={tw`flex-1 bg-[#0b1118]`}>
      {/* Header */}
      <View style={tw`px-4 pt-12 pb-4 border-b border-[#182430] bg-[#0f1821]/80`}>
        <Text style={tw`text-2xl font-extrabold text-white`}>Refund & Cancellation Policy</Text>
        <Text style={tw`mt-1 text-slate-400 text-xs`}>Last updated: {lastUpdated}</Text>
      </View>

      {/* Content */}
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`max-w-[900px] self-center w-full px-4 py-6 pb-28`}
      >
        {/* Intro */}
        <Card>
          <P>
            This policy applies to <Text style={tw`font-bold`}>Daybreak Learn</Text> (
            <Text
              style={tw`text-pink-400 underline`}
              onPress={() => open('https://www.daybreaklearner.com')}
            >
              daybreaklearner.com
            </Text>
            ), operated by <Text style={tw`font-bold`}>EKAZICONNECT SOLUTIONS LTD</Text> (Kenya Co.
            No. PVT-5JJZ5LQD). We provide live tutoring, tutor-published video lessons and courses,
            and AI-powered learning (lessons, quizzes, certificates).
          </P>

          <H2>1) Tokens (Store Credit)</H2>
          <UL
            items={[
              <Text>
                <Text style={tw`font-bold`}>Tokens</Text> are{' '}
                <Text style={tw`font-bold`}>non-transferable</Text> and{' '}
                <Text style={tw`font-bold`}>not redeemable for cash</Text>.
              </Text>,
              'Tokens purchase services on Daybreak Learn (sessions, courses, certificates).',
              'Approved refunds may be issued as Token credits or to the original payment method (see §7).',
            ]}
          />

          <H2>2) Live session cancellations by students</H2>
          <UL
            items={[
              <Text>
                <Text style={tw`font-bold`}>≥ 12 hours before</Text> start: 100% returned as Tokens.
              </Text>,
              <Text>
                <Text style={tw`font-bold`}>1–12 hours</Text> before: 50% returned as Tokens.
              </Text>,
              <Text>
                <Text style={tw`font-bold`}>{'< 1 hour'}</Text>, after start, or no-show: not
                refundable.
              </Text>,
            ]}
          />

          <H2>3) Live session cancellations by tutors</H2>
          <P>100% returned as Tokens, or—on request—refunded to the original payment method.</P>

          <H2>4) Tutor videos & on-demand courses</H2>
          <P>
            Streaming access begins immediately after purchase. Because this is digital content,
            purchases are <Text style={tw`font-bold`}>non-refundable once access has begun</Text>,
            except where the content is defective/unusable or materially not as described (then
            we’ll replace it or issue a Token credit/refund).
          </P>

          <H2>5) AI learning, quizzes & certificates</H2>
          <UL
            items={[
              'AI lessons and quizzes are included in platform access; learners may attempt quizzes freely.',
              <Text>
                Certificate fees are charged{' '}
                <Text style={tw`font-bold`}>only when you opt to generate a certificate</Text>.
              </Text>,
              <Text>
                Certificates are personalized digital goods;{' '}
                <Text style={tw`font-bold`}>non-refundable once generated</Text>, except for errors
                on our side (we’ll correct/reissue).
              </Text>,
            ]}
          />

          <H2>6) Service not delivered / technical failure</H2>
          <P>
            If a booked service can’t be delivered and we can’t re-schedule reasonably, you’ll
            receive 100% back (Tokens or original method).
          </P>

          <H2>7) Refund method & timing</H2>
          <UL
            items={[
              'Token credits: instant once approved.',
              'Original method: cards/PayPal ~5–10 business days; M-Pesa ~1–3 business days (processor/bank times vary).',
            ]}
          />

          <H2>8) Institutional subscriptions</H2>
          <P>
            Institutions (schools, NGOs, companies) may subscribe on behalf of learners/staff for AI
            learning and courses. Unless otherwise agreed in a master services agreement,
            institutional plans are billed in advance and are{' '}
            <Text style={tw`font-bold`}>non-refundable once seats are provisioned</Text>. We can
            pro-rate on upgrades/add-seats; mid-term downgrades take effect next renewal.
          </P>

          <H2>9) How to request a refund</H2>
          <P>
            Email{' '}
            <Text
              style={tw`text-pink-400 underline`}
              onPress={() => open('mailto:support@daybreaklearner.com')}
            >
              support@daybreaklearner.com
            </Text>{' '}
            with name, order/booking ID, date/time, and reason. We aim to reply within 2 business
            days.
          </P>

          <H2>10) Disputes & chargebacks</H2>
          <P>
            Please contact us first—we resolve most issues quickly. Filing a chargeback before
            contacting support may delay resolution.
          </P>

          <H2>11) Company & contact</H2>
          <View style={tw`rounded-xl p-4 bg-[#121927] mt-2`}>
            <Text style={tw`text-slate-100 font-semibold`}>EKAZICONNECT SOLUTIONS LTD</Text>
            <Text style={tw`text-slate-300`}>
              Registered Office: International House, Mama Ngina Street, CBD, Nairobi, Kenya
            </Text>
            <Text style={tw`text-slate-300`}>
              Postal Address: P.O. Box 1830-01000, Thika, Kenya
            </Text>
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

          {/* See also */}
          <View style={tw`mt-6`}>
            <Text style={tw`text-xs text-slate-400`}>
              See also:{' '}
              <Text
                style={tw`text-pink-400 underline`}
                onPress={() => navigation.navigate('FulfillmentPolicy' as any)}
              >
                Fulfillment & Delivery Policy
              </Text>{' '}
              •{' '}
              <Text
                style={tw`text-pink-400 underline`}
                onPress={() => navigation.navigate('PaymentFlow' as any)}
              >
                How Payments Work
              </Text>
            </Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

export default RefundsAndCancellationsNative;
