import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { Screen } from '../components/Screen';
import { ServiceHeroIllustration } from '../components/Illustrations';

export default function WelcomeScreen({ navigation }: any) {
  return (
    <Screen backgroundColor={colors.bg} keyboard={false}>
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
        <LinearGradient
          colors={['#FFFFFF', '#E8F8EE']}
          style={{
            flex: 1,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
            overflow: 'hidden',
            ...shadow.card,
          }}
        >
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#FFFFFF',
              borderRadius: radius.pill,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: 'rgba(15, 23, 42, 0.08)',
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.ink, fontWeight: '900' }}>Verified Kenyan pros</Text>
          </View>

          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <ServiceHeroIllustration width={286} height={226} />
          </View>

          <Text
            style={{
              color: colors.ink,
              fontSize: typography.hero,
              fontWeight: '900',
              lineHeight: 43,
              marginTop: spacing.md,
            }}
          >
            Get home jobs done without the back and forth.
          </Text>
          <Text
            style={{
              color: colors.mutedDark,
              fontSize: typography.body,
              marginTop: spacing.sm,
              lineHeight: 25,
            }}
          >
            Ekazi connects clients with nearby handymen for clear quotes, scheduled visits and trusted service.
          </Text>
        </LinearGradient>
      </View>

      <View
        style={{
          padding: spacing.xl,
          paddingTop: spacing.lg,
          backgroundColor: colors.bg,
        }}
      >
        <PrimaryButton title="Create Account" onPress={() => navigation.navigate('SignUp')} />
        <SecondaryButton
          title="Sign In"
          onPress={() => navigation.navigate('Login')}
          style={{ marginTop: 12 }}
        />
        <Text style={{ textAlign: 'center', marginTop: 14, color: colors.muted, fontWeight: '700' }}>
          Built for clients and handymen across Kenya.
        </Text>
      </View>
    </Screen>
  );
}
