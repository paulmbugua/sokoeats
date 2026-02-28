import React from 'react';
import { View, Text } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';

export default function RequestSubmittedScreen({ route, navigation }: any) {
  const jobId = route.params?.jobId;
  return (
    <View style={{ flex: 1, backgroundColor: 'white', padding: spacing.xl }}>
      <Card style={{ backgroundColor: '#ECFDF3', borderColor: '#BBF7D0' }}>
        <Text style={{ fontWeight: '900', fontSize: 18 }}>Request Submitted ✅</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>Providers in your area are reviewing your request. You'll see quotes here as they arrive.</Text>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900' }}>Add more photos</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Get more accurate quotes</Text>
      </Card>

      <Card style={{ marginTop: 10 }}>
        <Text style={{ fontWeight: '900' }}>Edit request</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Update details or requirements</Text>
      </Card>

      <View style={{ marginTop: 18 }}>
        <PrimaryButton title="View 3 Quotes" onPress={() => navigation.navigate('QuotesInbox', { jobId })} style={{ backgroundColor: colors.green } as any} />
        <SecondaryButton title="Back to Home" onPress={() => navigation.navigate('Tabs')} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}
