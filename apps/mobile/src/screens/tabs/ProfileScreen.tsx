import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Card from '../../components/Card';
import { colors, spacing } from '../../theme/tokens';
import PrimaryButton from '../../components/PrimaryButton';

export default function ProfileScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 30 }}>
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <Text style={{ color: 'white', fontWeight: '900', fontSize: 22 }}>John Doe</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 6 }}>john.doe@example.com</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>+254 712 345 678</Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>12</Text>
            <Text style={{ color: colors.muted }}>Jobs Done</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>3</Text>
            <Text style={{ color: colors.muted }}>Active</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>KES</Text>
            <Text style={{ color: colors.muted }}>Balance</Text>
          </Card>
        </View>

        <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>ACCOUNT</Text>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Personal Details</Text>
        </Card>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Saved Addresses</Text>
        </Card>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Payment Methods</Text>
        </Card>

        <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>PREFERENCES</Text>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Notifications</Text>
        </Card>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Language</Text>
        </Card>

        <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>SUPPORT & SAFETY</Text>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Help & Support</Text>
        </Card>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Safety Center</Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton title="Log Out" onPress={() => navigation.replace('Welcome')} style={{ backgroundColor: '#FEE2E2' } as any} />
        </View>

        <Text style={{ textAlign: 'center', marginTop: 18, color: colors.muted }}>FixIt Kenya v1.0.0</Text>
        <Text style={{ textAlign: 'center', marginTop: 8, color: colors.primary, fontWeight: '800' }}>Terms · Privacy</Text>
      </ScrollView>
    </View>
  );
}
