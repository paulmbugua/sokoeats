import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';

export default function QuoteDetailScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 24 }}>
        <Card>
          <Text style={{ fontWeight: '900', fontSize: 18 }}>James Kamau</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>⭐ 4.9 (127 reviews) · 2.3 km · Under 10 min</Text>
          <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' }}>
            <Badge label="ID Verified" tone="green" />
            <Badge label="Background Checked" tone="blue" />
            <Badge label="Top Rated Pro" tone="purple" />
          </View>
          <Text style={{ color: colors.muted, marginTop: 12 }}>245 jobs completed</Text>
        </Card>

        <Text style={{ textAlign: 'center', marginTop: 16, fontSize: 34, fontWeight: '900' }}>KES 3,000</Text>
        <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 4 }}>Total Quote</Text>

        <Card style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.muted }}>Labor</Text>
            <Text style={{ fontWeight: '800' }}>KES 1,800</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ color: colors.muted }}>Materials (estimated)</Text>
            <Text style={{ fontWeight: '800' }}>KES 900</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ color: colors.muted }}>Transport</Text>
            <Text style={{ fontWeight: '800' }}>KES 300</Text>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '900' }}>Total</Text>
            <Text style={{ fontWeight: '900' }}>KES 3,000</Text>
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Availability</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>🕒 Can arrive in 2 hours</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>⏱ Estimated duration: 1-2 hours</Text>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Message from Provider</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>I can fix your leaking tap quickly and professionally. I have all necessary tools and materials. Available to start today.</Text>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>About James</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>Licensed plumber with 8+ years experience. Specializing in residential and commercial plumbing.</Text>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Reviews</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>★★★★★ 2 weeks ago</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Excellent work! Very professional and completed the job quickly.</Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <SecondaryButton title="Message" onPress={() => navigation.navigate('Tabs', { screen: 'Messages' })} style={{ flex: 1 }} />
          <PrimaryButton title="Accept Quote" onPress={() => navigation.navigate('BookingConfirmed', { bookingId: 'b1', jobId: 'job_demo_1', quoteId: 'q1' })} style={{ flex: 1, backgroundColor: colors.green } as any} />
        </View>
      </ScrollView>
    </View>
  );
}
