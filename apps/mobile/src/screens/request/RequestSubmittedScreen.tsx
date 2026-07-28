import React from 'react';
import { View, Text } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { ScreenScroll } from '../../components/Screen';

export default function RequestSubmittedScreen({ route, navigation }: any) {
  const jobId = route.params?.jobId;
  return (
    <ScreenScroll backgroundColor={colors.bg}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: '#BBF7D0' }}>
        <Text style={{ fontWeight: '900', fontSize: 18, color: colors.ink }}>Request submitted</Text>
        <Text style={{ color: colors.mutedDark, marginTop: 8, lineHeight: 21 }}>
          Providers in your area are reviewing your request. Real quotes will appear as providers send them.
        </Text>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900', color: colors.ink }}>Add more photos</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Photos help providers price the job accurately.</Text>
      </Card>

      <Card style={{ marginTop: 10 }}>
        <Text style={{ fontWeight: '900', color: colors.ink }}>Edit request</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Update details or requirements before accepting a quote.</Text>
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <PrimaryButton
          title="View Quotes"
          onPress={() => navigation.navigate('QuotesInbox', { jobId })}
          style={{ backgroundColor: colors.green } as any}
        />
        <SecondaryButton title="Back to Home" onPress={() => navigation.navigate('Tabs')} style={{ marginTop: 12 }} />
      </View>
    </ScreenScroll>
  );
}
