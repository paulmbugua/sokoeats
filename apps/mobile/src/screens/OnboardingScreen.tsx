import React, { useMemo, useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme/tokens';
import PrimaryButton from '../components/PrimaryButton';

const slides = [
  { icon: 'search', title: 'Get Quotes from Verified Pros', body: 'Describe your job and receive multiple quotes\nfrom background-checked professionals in\nyour area', color: colors.primary },
  { icon: 'star', title: 'Compare Price, Rating & Arrival Time', body: 'Review detailed breakdowns, read reviews\nfrom other customers, and choose the best\nmatch for your needs', color: colors.purple },
  { icon: 'shield-checkmark', title: 'Pay via M-Pesa Securely', body: 'Pay only when the job is done. Your money is\nprotected and disputes are handled fairly', color: colors.green },
  { icon: 'notifications', title: 'Stay Updated in Real-Time', body: 'Get notifications for new quotes, messages,\nand job updates. Track your provider on the\nway', color: colors.orange },
];

export default function OnboardingScreen({ navigation }: any) {
  const [idx, setIdx] = useState(0);
  const slide = slides[idx];
  const dots = useMemo(() => slides.map((_, i) => i), []);

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 18, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {dots.map((i) => (
            <View key={i} style={{ height: 4, width: i === idx ? 28 : 18, borderRadius: 999, backgroundColor: i === idx ? colors.primary : '#E5E7EB' }} />
          ))}
        </View>
        <Text style={{ color: colors.muted, fontWeight: '700' }} onPress={() => navigation.navigate('Login')}>
          Skip
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }}>
        <View style={{ width: 110, height: 110, borderRadius: radius.xl, backgroundColor: slide.color, justifyContent: 'center', alignItems: 'center', marginBottom: 22 }}>
          <Ionicons name={(slide.icon + '-outline') as any} size={44} color="white" />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '900', textAlign: 'center', color: colors.text }}>{slide.title}</Text>
        <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 20 }}>{slide.body}</Text>
      </View>

      <View style={{ padding: spacing.xl }}>
        <PrimaryButton
          title={idx === slides.length - 1 ? 'Get Started' : 'Continue'}
          onPress={() => {
            if (idx === slides.length - 1) navigation.navigate('Login');
            else setIdx((v) => Math.min(slides.length - 1, v + 1));
          }}
        />
      </View>
    </View>
  );
}
