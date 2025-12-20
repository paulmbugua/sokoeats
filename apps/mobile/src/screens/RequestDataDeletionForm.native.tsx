// apps/mobile/src/screens/RequestDataDeletionForm.native.tsx

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import tw from '../../tailwind'; // <-- adjust path to your Tailwind helper

// If you use react-native-vector-icons:
import Icon from 'react-native-vector-icons/Feather';
// or: import Icon from 'react-native-vector-icons/FontAwesome5';

// Optional (nice gradient button). If you use Expo:
// import { LinearGradient } from 'expo-linear-gradient';
// If not using Expo, keep the solid button variant below.

const EMAIL_TO = 'info@DayBreak.co.ke';

const RequestDataDeletionForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValidEmail = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  const subject = useMemo(() => encodeURIComponent('Request for Personal Data Deletion'), []);

  const buildBody = useCallback(() => {
    const lines = [
      'Hello DayBreak Data Privacy Team,',
      '',
      `My name: ${name}`,
      `Email: ${email}`,
      '',
      'I hereby request deletion of all my personal data from your systems.',
      details.trim() ? `\nDetails:\n${details.trim()}` : '',
      '',
      'Thank you,',
      name,
    ];
    return encodeURIComponent(lines.join('\n'));
  }, [name, email, details]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing info', 'Please fill in your name and email.');
      return;
    }
    if (!isValidEmail) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    try {
      setSubmitting(true);
      const mailto = `mailto:${EMAIL_TO}?subject=${subject}&body=${buildBody()}`;
      const can = await Linking.canOpenURL(mailto);
      if (!can) {
        Alert.alert(
          'Email not available',
          `We couldn't open your email app. Please email us at ${EMAIL_TO}.`
        );
      } else {
        await Linking.openURL(mailto);
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong opening your email app.');
    } finally {
      setSubmitting(false);
    }
  }, [isValidEmail, buildBody, subject]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={tw`flex-1 bg-slate-900`}
    >
      <ScrollView
        contentContainerStyle={tw`flex-1 justify-center px-4 py-10`}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={tw`w-full max-w-xl self-center bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-700`}
        >
          <Text style={tw`text-2xl font-extrabold text-center text-blue-400`}>
            Request Personal Data Deletion
          </Text>

          {/* Name */}
          <View style={tw`mt-6 flex-row items-center bg-slate-700 rounded-xl px-4 py-3`}>
            <Icon name="user" size={18} style={tw`text-slate-400 mr-3`} />
            <TextInput
              placeholder="Your Full Name"
              placeholderTextColor="#94a3b8"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              style={tw`flex-1 text-white`}
              returnKeyType="next"
            />
          </View>

          {/* Email */}
          <View style={tw`mt-4 flex-row items-center bg-slate-700 rounded-xl px-4 py-3`}>
            <Icon name="mail" size={18} style={tw`text-slate-400 mr-3`} />
            <TextInput
              placeholder="Your Email Address"
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              style={tw`flex-1 text-white`}
              returnKeyType="next"
            />
          </View>

          {/* Details */}
          <View style={tw`mt-4 flex-row items-start bg-slate-700 rounded-xl px-4 py-3`}>
            <Icon name="clipboard" size={18} style={tw`text-slate-400 mr-3 mt-1`} />
            <TextInput
              placeholder="Additional details (optional)"
              placeholderTextColor="#94a3b8"
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={4}
              style={tw`flex-1 text-white h-28`}
              textAlignVertical="top"
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={submitting}
            onPress={handleSubmit}
            style={tw.style(
              'mt-6 w-full flex-row items-center justify-center rounded-xl px-6 py-3',
              submitting ? 'opacity-60 bg-pink-600' : 'bg-pink-600'
            )}
          >
            {submitting ? (
              <>
                <ActivityIndicator color="#fff" style={tw`mr-2`} />
                <Text style={tw`text-white font-semibold`}>Please wait…</Text>
              </>
            ) : (
              <>
                <Icon name="send" size={16} style={tw`text-white mr-2`} />
                <Text style={tw`text-white font-semibold`}>Send Deletion Request</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Alt contact hint */}
          <Text style={tw`mt-4 text-center text-slate-400 text-xs`}>
            If your email app doesn’t open, please email us directly at{' '}
            <Text style={tw`text-sky-300`}>{EMAIL_TO}</Text>.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default RequestDataDeletionForm;
