/* eslint-disable prettier/prettier */
import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, View, Text, Pressable, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import tw from '../../tailwind';

import type { MainStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

// Whitelist the policy routes we link to
const POLICY_ROUTES = [
  'RefundsAndCancellations',
  'FulfillmentPolicy',
  'PrivacyPolicy',
  'AntiSpamPolicy',
  'PaymentFlow',
] as const;

type PolicyRoute = (typeof POLICY_ROUTES)[number];
type Nav = StackNavigationProp<MainStackParamList, PolicyRoute>;

const email = (addr: string) => Linking.openURL(`mailto:${addr}`);
const tel = (num: string) => Linking.openURL(`tel:${num}`);

const ComplaintsFeedbackScreen: React.FC = () => {
  // ✅ Properly typed navigation
  const navigation = useNavigation<Nav>();
  const lastUpdated = useMemo(() => new Date().toLocaleDateString(), []);

  const NavLink = ({ title, route }: { title: string; route: PolicyRoute }) => (
    <Pressable onPress={() => navigation.navigate(route)} style={tw`py-1`}>
      <Text style={tw`text-primary underline`}>{title}</Text>
    </Pressable>
  );

  const Mail = ({ to }: { to: string }) => (
    <Pressable onPress={() => email(to)}>
      <Text style={tw`text-primary`}>{to}</Text>
    </Pressable>
  );

  const Phone = ({ num }: { num: string }) => (
    <Pressable onPress={() => tel(num)}>
      <Text style={tw`text-primary`}>{num}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-white dark:bg-[#0b1016]`}>
      <ScrollView contentContainerStyle={tw`max-w-3xl mx-auto px-4 py-10`}>
        <Text style={tw`text-2xl font-bold text-darkText dark:text-white`}>
          Complaints & Feedback
        </Text>
        <Text style={tw`text-sm text-gray-500 dark:text-white/60`}>
          Last updated: {lastUpdated}
        </Text>

        <View style={tw`mt-6 gap-5`}>
          <Text style={tw`text-sm leading-6 text-darkText dark:text-white/90`}>
            We want every learner, tutor, and institution to have a great experience. Tell us what
            went well and what we should improve.
          </Text>

          {/* 1) How to contact us */}
          <Text style={tw`text-lg font-semibold text-darkText dark:text-white`}>
            1) How to contact us
          </Text>
          <View style={tw`pl-4`}>
            <View style={tw`flex-row`}>
              <Text style={tw`mr-1`}>{'\u2022'}</Text>
              <Text style={tw`text-sm text-darkText dark:text-white/90`}>
                Email support: <Mail to="support@daybreaklearner.com" />
              </Text>
            </View>
            <View style={tw`flex-row mt-2`}>
              <Text style={tw`mr-1`}>{'\u2022'}</Text>
              <Text style={tw`text-sm text-darkText dark:text-white/90`}>
                Abuse/spam reports: <Mail to="abuse@daybreaklearner.com" />
              </Text>
            </View>
            <View style={tw`flex-row mt-2`}>
              <Text style={tw`mr-1`}>{'\u2022'}</Text>
              <Text style={tw`text-sm text-darkText dark:text-white/90`}>
                Privacy requests: <Mail to="privacy@daybreaklearner.com" />
              </Text>
            </View>
            <View style={tw`flex-row mt-2`}>
              <Text style={tw`mr-1`}>{'\u2022'}</Text>
              <View style={tw`flex-row flex-wrap`}>
                <Text style={tw`text-sm text-darkText dark:text-white/90`}>Phones: </Text>
                <Phone num="+254728872800" />
                <Text style={tw`text-sm mx-1`}> , </Text>
                <Phone num="+254720423764" />
                <Text style={tw`text-sm mx-1`}> , </Text>
                <Phone num="+254758276900" />
              </View>
            </View>
          </View>

          {/* 2) What to include */}
          <Text style={tw`text-lg font-semibold text-darkText dark:text-white`}>
            2) What to include
          </Text>
          <Text style={tw`text-sm leading-6 text-darkText dark:text-white/90`}>
            Order/booking ID (if any), your account email, date/time, tutor/course title,
            screenshots, and a short description of the issue.
          </Text>

          {/* 3) Our response times */}
          <Text style={tw`text-lg font-semibold text-darkText dark:text-white`}>
            3) Our response times
          </Text>
          <View style={tw`pl-4`}>
            <Bullet>General support: initial response within 2 business days.</Bullet>
            <Bullet>
              Payment/refund issues: initial response within 2 business days; resolution as fast as
              your processor allows.
            </Bullet>
            <Bullet>Abuse/spam reports: we triage within 24 hours.</Bullet>
          </View>

          {/* 4) Escalation */}
          <Text style={tw`text-lg font-semibold text-darkText dark:text-white`}>4) Escalation</Text>
          <Text style={tw`text-sm leading-6 text-darkText dark:text-white/90`}>
            If you’re not satisfied with the outcome, reply to the thread requesting escalation. A
            senior reviewer will reassess the case.
          </Text>

          {/* 5) Helpful links */}
          <Text style={tw`text-lg font-semibold text-darkText dark:text-white`}>
            5) Helpful links
          </Text>
          <View style={tw`pl-1`}>
            <NavLink title="Refund & Cancellation Policy" route="RefundsAndCancellations" />
            <NavLink title="Fulfillment & Delivery Policy" route="FulfillmentPolicy" />
            <NavLink title="Privacy Policy" route="PrivacyPolicy" />
            <NavLink title="Anti-Spam Policy" route="AntiSpamPolicy" />
            <NavLink title="How Payments Work" route="PaymentFlow" />
          </View>

          {/* 6) Company & address */}
          <Text style={tw`text-lg font-semibold text-darkText dark:text-white`}>
            6) Company & address
          </Text>
          <View style={tw`rounded-md p-4 bg-gray-50 dark:bg-[#121927]`}>
            <Text style={tw`text-sm font-bold text-darkText dark:text-white`}>
              EKAZICONNECT SOLUTIONS LTD
            </Text>
            <Text style={tw`text-sm text-darkText dark:text-white/90`}>
              Registered Office: International House, Mama Ngina Street, CBD, Nairobi, Kenya
            </Text>
            <Text style={tw`text-sm text-darkText dark:text-white/90`}>
              Postal: P.O. Box 1830-01000, Thika, Kenya
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={tw`flex-row mt-2`}>
    <Text style={tw`mr-1`}>{'\u2022'}</Text>
    <Text style={tw`text-sm text-darkText dark:text-white/90 flex-1`}>{children}</Text>
  </View>
);

export default ComplaintsFeedbackScreen;
