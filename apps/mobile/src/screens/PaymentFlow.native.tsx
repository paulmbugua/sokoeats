/// <reference path="../declarations.d.ts" />

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

type SectionProps = {
  title: string;
  items: Array<React.ReactNode | string>;
};

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={tw`rounded-2xl border border-[#182430] bg-[#0f1821] p-4`}>{children}</View>
);

const Section: React.FC<SectionProps> = ({ title, items }) => (
  <Card>
    <Text style={tw`text-lg font-semibold text-slate-100`}>{title}</Text>
    <View style={tw`mt-2 pl-3`}>
      {items.map((it, idx) => (
        <View key={idx} style={tw`flex-row mb-1`}>
          <Text style={tw`text-slate-400 mr-2`}>{idx + 1}.</Text>
          <Text style={tw`flex-1 text-slate-200`}>{it as any}</Text>
        </View>
      ))}
    </View>
  </Card>
);

const PaymentFlowNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();

  return (
    <View style={tw`flex-1 bg-[#0b1118]`}>
      {/* Header */}
      <View style={tw`px-4 pt-12 pb-4 border-b border-[#182430] bg-[#0f1821]/80`}>
        <Text style={tw`text-2xl font-extrabold text-white`}>How Payments Work</Text>
        <Text style={tw`mt-1 text-slate-400 text-xs`}>
          Transparent flows for live sessions, on-demand courses, AI learning, and certificates
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`max-w-[900px] self-center w-full px-4 py-6 gap-4 pb-28`}
      >
        {/* A) Buy Tokens */}
        <Section
          title="A) Buy Tokens"
          items={[
            'Student buys Tokens (PayPal or M-Pesa).',
            'Tokens credit the student account instantly.',
          ]}
        />

        {/* B) Book a Live Session */}
        <Section
          title="B) Book a Live Session"
          items={[
            'Student selects tutor/time → we hold Tokens.',
            'After completion (or 24h auto-complete), Tokens are captured.',
            'Platform fee retained; tutor payout released (24–72h typical).',
          ]}
        />

        {/* C) Buy Tutor Videos & Courses */}
        <Section
          title="C) Buy Tutor Videos & Courses"
          items={[
            'Student browses catalog and purchases directly with Tokens.',
            'Streaming access unlocks immediately in the student library.',
            'Payouts to the tutor are scheduled per product rules.',
          ]}
        />

        {/* D) AI Learning, Quizzes & Certificates */}
        <Section
          title="D) AI Learning, Quizzes & Certificates"
          items={[
            'Students study AI lessons and attempt quizzes freely.',
            'Only when a certificate is requested do we charge the certificate fee (Tokens).',
            'Certificate is generated and added to the student’s profile for download/verification.',
          ]}
        />

        {/* E) Institutions */}
        <Section
          title="E) Institutions (Schools/Companies/NGOs)"
          items={[
            'Institution purchases a subscription/seat bundle or issues a PO.',
            'We provision seats to the admin (1–2 business days).',
            'Learners access AI learning, courses, and optional certificates (billed per plan).',
          ]}
        />

        {/* Important note */}
        <Card>
          <Text style={tw`text-xs text-slate-300`}>
            <Text style={tw`font-bold text-slate-100`}>Important: </Text>
            Tokens are non-transferable and not redeemable for cash. See the{' '}
            <Text
              style={tw`text-pink-400 underline`}
              onPress={() => navigation.navigate('RefundPolicy' as any)}
            >
              Refund Policy
            </Text>{' '}
            and{' '}
            <Text
              style={tw`text-pink-400 underline`}
              onPress={() => navigation.navigate('FulfillmentPolicy' as any)}
            >
              Fulfillment Policy
            </Text>
            .
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
};

export default PaymentFlowNative;
