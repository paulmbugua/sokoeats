import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Card from '../../components/Card';
import { colors, spacing } from '../../theme/tokens';
import { Screen } from '../../components/Screen';

export default function MessagesScreen() {
  return (
    <Screen backgroundColor="white">
      <View style={{ padding: spacing.xl, paddingBottom: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: '900' }}>Messages</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 110 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>James Kamau</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>I can start in about 2 hours. Is that okay?</Text>
        </Card>
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Peter Omondi</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Quote sent! Let me know if you have any questions.</Text>
        </Card>
        <Card>
          <Text style={{ fontWeight: '900' }}>John Mwangi</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Thank you for choosing me!</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
