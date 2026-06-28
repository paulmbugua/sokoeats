import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme/tokens';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';

import { Screen } from '../components/Screen';
export default function WelcomeScreen({ navigation }: any) {
  return (
    <Screen backgroundColor={colors.primary} keyboard={false}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 22,
            backgroundColor: 'white',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <Ionicons name="hammer-outline" size={40} color={colors.primary} />
        </View>
        <Text style={{ color: 'white', fontSize: 34, fontWeight: '800', textAlign: 'center' }}>Welcome to FixIt</Text>
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
          Get quotes from verified handymen{`\n`}Compare prices, read reviews, and book trusted professionals across Nairobi
        </Text>
      </View>

      <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: spacing.xxl }}>
        <PrimaryButton title="Request a Quote" onPress={() => navigation.navigate('Onboarding')} />
        <SecondaryButton title="Browse Pros" onPress={() => navigation.navigate('Onboarding')} style={{ marginTop: 12 }} />
        <Text style={{ textAlign: 'center', marginTop: 14, color: colors.muted }}>
          Already have an account?{' '}
          <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => navigation.navigate('Login')}>
            Sign In
          </Text>
        </Text>
      </View>
    </Screen>
  );
}
