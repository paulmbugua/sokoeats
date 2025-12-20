/// <reference path="../declarations.d.ts" />

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';

/* ------------------------------------------------------------------ */
/* Small, native "card" primitives                                    */
/* ------------------------------------------------------------------ */

const Card: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={tw`p-5 rounded-2xl bg-[#0f1821] border border-[#182430] shadow-lg`}>
    {title ? <Text style={tw`text-lg font-bold text-pink-400 mb-3`}>{title}</Text> : null}
    {children}
  </View>
);

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={tw`text-3xl font-extrabold text-pink-300 text-center mb-6`}>{children}</Text>
);

/* ------------------------------------------------------------------ */
/* DeleteAccount (native)                                              */
/* - Keeps it simple & safe by opening a mail draft to Support        */
/* - If you already have an API endpoint, swap the handler below      */
/* ------------------------------------------------------------------ */

const DeleteAccountNative: React.FC = () => {
  const { backendUrl, token } = useShopContext();

  const openSupportEmail = async () => {
    const subject = encodeURIComponent('Account Deletion Request');
    const body = encodeURIComponent(
      [
        'Hello DayBreak Support,',
        '',
        'I would like to permanently delete my account.',
        '',
        'Please confirm the request and next steps.',
        '',
        `Platform: ${Platform.OS}`,
        token ? '(I am currently signed in.)' : '(I am not signed in.)',
        backendUrl ? `Backend: ${backendUrl}` : '',
        '',
        'Thanks,',
        '',
      ]
        .filter(Boolean)
        .join('\n')
    );
    const mailto = `mailto:support@daybreaklearner.com?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(mailto);
    } catch {
      Alert.alert('Error', 'Could not open your email client.');
    }
  };

  const onRequestDelete = () => {
    Alert.alert(
      'Delete Account?',
      'This will permanently remove your profile, tokens, enrollments, and certificates. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Contact Support', style: 'destructive', onPress: openSupportEmail },
      ]
    );
  };

  return (
    <Card title="Delete Account">
      <Text style={tw`text-slate-300`}>
        You can request permanent deletion of your DayBreak account. This removes your profile and
        personal data subject to legal/financial retention obligations.
      </Text>
      <TouchableOpacity onPress={onRequestDelete} style={tw`mt-4 px-4 py-3 rounded-xl bg-rose-600`}>
        <Text style={tw`text-white text-center font-semibold`}>Request Account Deletion</Text>
      </TouchableOpacity>
      <Text style={tw`mt-2 text-xs text-slate-400`}>
        Tip: If you have an ongoing withdrawal or dispute, we may complete those before deletion.
      </Text>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* RequestDataDeletionForm (native)                                    */
/* - Sends a prefilled email to Support                               */
/* - Easy to swap to a POST if you expose an API later                */
/* ------------------------------------------------------------------ */

const RequestDataDeletionFormNative: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [accountId, setAccountId] = useState('');
  const [details, setDetails] = useState('');

  const valid = useMemo(
    () => fullName.trim().length > 1 && /\S+@\S+\.\S+/.test(email),
    [fullName, email]
  );

  const submit = async () => {
    if (!valid) {
      Alert.alert('Missing info', 'Please provide your full name and a valid email address.');
      return;
    }
    const subject = encodeURIComponent('Personal Data Deletion / GDPR Request');
    const body = encodeURIComponent(
      [
        'Hello DayBreak Support,',
        '',
        'I would like to request deletion of my personal data.',
        '',
        `Full Name: ${fullName}`,
        `Email: ${email}`,
        accountId ? `Account ID: ${accountId}` : '',
        details ? `Details: ${details}` : '',
        '',
        'Please confirm once this request is processed.',
        '',
        'Thanks,',
        fullName,
      ]
        .filter(Boolean)
        .join('\n')
    );
    const mailto = `mailto:support@daybreaklearner.com?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(mailto);
    } catch {
      Alert.alert('Error', 'Could not open your email client.');
    }
  };

  const inputStyle = tw`w-full p-3 rounded-xl bg-[#0b1620] border border-[#182430] text-slate-100`;

  return (
    <Card title="Request Data Deletion">
      <View style={tw`gap-3`}>
        <View>
          <Text style={tw`text-slate-300 mb-1`}>Full Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Jane Doe"
            placeholderTextColor="#93a3b0"
            style={inputStyle}
          />
        </View>
        <View>
          <Text style={tw`text-slate-300 mb-1`}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
            placeholderTextColor="#93a3b0"
            style={inputStyle}
          />
        </View>
        <View>
          <Text style={tw`text-slate-300 mb-1`}>Account ID (optional)</Text>
          <TextInput
            value={accountId}
            onChangeText={setAccountId}
            placeholder="User ID or username"
            placeholderTextColor="#93a3b0"
            style={inputStyle}
          />
        </View>
        <View>
          <Text style={tw`text-slate-300 mb-1`}>Details (optional)</Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Any additional context…"
            placeholderTextColor="#93a3b0"
            style={[inputStyle, tw`min-h-[96px]`]}
            multiline
          />
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={!valid}
          style={tw.style(
            'mt-1 px-4 py-3 rounded-xl',
            valid ? 'bg-pink-600' : 'bg-pink-600 opacity-60'
          )}
        >
          <Text style={tw`text-white text-center font-semibold`}>Send Request</Text>
        </TouchableOpacity>

        <Text style={tw`text-xs text-slate-400`}>
          We’ll respond via email. You can also reach us directly at{' '}
          <Text
            style={tw`text-pink-400 underline`}
            onPress={() => Linking.openURL('mailto:support@daybreaklearner.com')}
          >
            support@daybreaklearner.com
          </Text>
          .
        </Text>
      </View>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* Help Page (native)                                                  */
/* ------------------------------------------------------------------ */

const HelpPageNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();

  return (
    <View style={tw`flex-1 bg-[#0b1118]`}>
      {/* Simple header */}
      <View
        style={tw`px-4 pt-12 pb-4 border-b border-[#182430] bg-[#0f1821]/80`}
        accessibilityRole="header"
      >
        <Text style={tw`text-center text-3xl font-extrabold text-pink-300`}>Help Center</Text>
        <Text style={tw`mt-1 text-center text-slate-400 text-xs`}>
          Manage your account & privacy
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`gap-5 p-4 pb-28 max-w-[980px] self-center w-full`}
      >
        <DeleteAccountNative />
        <RequestDataDeletionFormNative />
      </ScrollView>

      {/* Sticky footer-like info */}
      <View
        style={tw`absolute bottom-0 left-0 right-0 p-4 bg-[#0f1821]/80 border-t border-[#182430]`}
      >
        <Text style={tw`text-center text-[11px] text-slate-400`}>
          Need more help?{' '}
          <Text
            style={tw`text-pink-400 underline`}
            onPress={() => Linking.openURL('mailto:support@daybreaklearner.com')}
          >
            Email Support
          </Text>
          {'  '}•{'  '}
          <Text
            style={tw`text-pink-400 underline`}
            onPress={() => Linking.openURL('https://daybreaklearner.com')}
          >
            daybreaklearner.com
          </Text>
        </Text>
      </View>
    </View>
  );
};

export default HelpPageNative;
