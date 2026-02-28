import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';

export default function ReviewRequestScreen({ route, navigation }: any) {
  const { draft } = route.params;
  const budget = draft.budgetMin || draft.budgetMax ? `KES ${draft.budgetMin ?? ''} - ${draft.budgetMax ?? ''}` : 'Not set';

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 24 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Job Type</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{draft.categoryName} · {draft.serviceName}</Text>
          <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 8 }}>Edit</Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Description</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{draft.description}</Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Photos</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{(draft.photoUrls?.length ?? 0)} photos uploaded</Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Location</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{draft.estate}, {draft.city}</Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Schedule</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{draft.scheduleType}</Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Budget Range</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{budget}</Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Materials</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{draft.providerBringsMaterials ? 'Provider brings materials' : 'Customer provides materials'}</Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Additional Notes</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{draft.notes || '—'}</Text>
        </Card>

        <Card style={{ backgroundColor: '#ECFDF3', borderColor: '#BBF7D0' }}>
          <Text style={{ fontWeight: '900' }}>💡 What happens next?</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Verified providers near you will review your request and send quotes within minutes. You'll be notified as quotes arrive.</Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton title="Submit Request" onPress={() => navigation.replace('RequestSubmitted', { jobId: 'job_demo_1' })} />
        </View>
      </ScrollView>
    </View>
  );
}
