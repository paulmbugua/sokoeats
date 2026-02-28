import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Chip from '../../components/Chip';
import Card from '../../components/Card';

export default function RequestsScreen({ navigation }: any) {
  const [tab, setTab] = useState<'active' | 'completed' | 'cancelled'>('active');

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={{ padding: spacing.xl, paddingBottom: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: '900' }}>My Requests</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Chip label="Active" active={tab === 'active'} onPress={() => setTab('active')} />
          <Chip label="Completed" active={tab === 'completed'} onPress={() => setTab('completed')} />
          <Chip label="Cancelled" active={tab === 'cancelled'} onPress={() => setTab('cancelled')} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0 }}>
        {tab === 'active' ? (
          <>
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ fontWeight: '900', fontSize: 16 }}>Leaking tap repair</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>Kilimani · Today</Text>
              <Text style={{ color: colors.green, fontWeight: '900', marginTop: 10 }} onPress={() => navigation.navigate('QuotesInbox', { jobId: 'job_demo_1' })}>
                View quotes →
              </Text>
            </Card>
            <Card>
              <Text style={{ fontWeight: '900', fontSize: 16 }}>Wall painting 2-bedroom</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>Westlands · Tomorrow</Text>
              <Text style={{ marginTop: 10, color: colors.primary, fontWeight: '900' }}>Message</Text>
            </Card>
          </>
        ) : (
          <Card>
            <Text style={{ color: colors.muted }}>No items in this tab yet.</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
