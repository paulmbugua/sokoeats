import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';

export default function BookingConfirmedScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 24 }}>
        <Card style={{ backgroundColor: colors.greenSoft, borderColor: '#BBF7D0', alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>✅</Text>
          <Text style={{ fontWeight: '900', fontSize: 20, marginTop: 8 }}>Booking Confirmed!</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>James Kamau will arrive in approximately</Text>
          <Text style={{ fontWeight: '900', marginTop: 4 }}>2 hours</Text>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>James Kamau</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Plumbing · Kilimani</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <SecondaryButton title="Call" onPress={() => {}} style={{ flex: 1 }} />
            <SecondaryButton title="Message" onPress={() => navigation.navigate('Tabs', { screen: 'Messages' })} style={{ flex: 1 }} />
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Job Details</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>📅 Today, 2:00 PM - 4:00 PM</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>⏱ Estimated duration: 1-2 hours</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>📍 Kilimani, Nairobi</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Gate code: 1234</Text>
          <Text style={{ marginTop: 10, fontWeight: '900' }}>KES 3,000</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }}>Pay on completion</Text>
        </Card>

        <Card style={{ marginTop: 14, backgroundColor: colors.blueSoft }}>
          <Text style={{ fontWeight: '900' }}>What happens next?</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>1. Provider will confirm and head to your location</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>2. You'll get notified when they're on the way</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>3. Pay securely via M-Pesa after job completion</Text>
        </Card>

        <Card style={{ marginTop: 14, backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }}>
          <Text style={{ fontWeight: '900' }}>Safety Reminder</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>Share your booking details with a family member or friend. Report any issues immediately.</Text>
        </Card>

        <View style={{ marginTop: 16 }}>
          <PrimaryButton title="Track Provider" onPress={() => {}} />
          <SecondaryButton title="Share Booking Details" onPress={() => {}} style={{ marginTop: 12 }} />
          <Text style={{ textAlign: 'center', color: colors.danger, fontWeight: '900', marginTop: 16 }} onPress={() => navigation.navigate('Tabs')}>
            Cancel Booking
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
