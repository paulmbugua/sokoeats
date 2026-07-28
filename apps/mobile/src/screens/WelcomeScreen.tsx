import React from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { Screen } from '../components/Screen';
import { ServiceHeroIllustration } from '../components/Illustrations';

export default function WelcomeScreen({ navigation }: any) {
  const { height, width } = useWindowDimensions();

  React.useEffect(() => {
    console.log('[welcome][mount]', { height, width });
    const unsubscribe = navigation?.addListener?.('focus', () => {
      console.log('[welcome][focus]', { height, width });
    });
    return unsubscribe;
  }, [height, navigation, width]);
  const compact = height < 760;
  const horizontalPadding = width < 380 ? spacing.lg : spacing.xl;
  const heroWidth = Math.min(width - horizontalPadding * 2 - spacing.lg * 2, compact ? 230 : 286);
  const heroHeight = Math.round(heroWidth * 0.79);
  const titleSize = width < 380 ? 35 : compact ? 37 : typography.hero;
  const titleLineHeight = Math.round(titleSize * 1.1);

  return (
    <Screen backgroundColor={colors.bg} keyboard={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: horizontalPadding,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xl,
        }}
      >
        <LinearGradient
          colors={['#FFFFFF', '#E8F8EE']}
          style={{
            borderRadius: radius.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: compact ? spacing.lg : spacing.xl,
            paddingBottom: spacing.xl,
            ...shadow.card,
          }}
        >
          <View
            style={{
              alignSelf: 'flex-start',
              maxWidth: '100%',
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
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.84}
              style={{ color: colors.ink, fontWeight: '900', flexShrink: 1 }}
            >
              Verified Kenyan pros
            </Text>
          </View>

          <View style={{ alignItems: 'center', marginTop: compact ? spacing.md : spacing.lg }}>
            <ServiceHeroIllustration width={heroWidth} height={heroHeight} />
          </View>

          <Text
            maxFontSizeMultiplier={1.08}
            style={{
              color: colors.ink,
              fontSize: titleSize,
              fontWeight: '900',
              lineHeight: titleLineHeight,
              marginTop: compact ? spacing.sm : spacing.md,
            }}
          >
            Get home jobs done without the back and forth.
          </Text>
          <Text
            maxFontSizeMultiplier={1.12}
            style={{
              color: colors.mutedDark,
              fontSize: compact ? 17 : typography.body,
              marginTop: spacing.sm,
              lineHeight: compact ? 24 : 27,
            }}
          >
            Ekazi connects clients with nearby providers for clear quotes, scheduled visits and trusted service.
          </Text>
        </LinearGradient>

        <View
          style={{
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
          <Text
            maxFontSizeMultiplier={1.08}
            style={{ textAlign: 'center', marginTop: 14, color: colors.muted, fontWeight: '800', fontSize: typography.small, lineHeight: 21 }}
          >
            Built for clients and providers across Kenya.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
