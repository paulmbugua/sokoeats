import React, { useState } from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { colors, spacing, radius } from '../../theme/tokens';
import Card from '../../components/Card';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import Input from '../../components/Input';
import { Screen } from '../../components/Screen';

export default function JobDetailsScreen({ route, navigation }: any) {
  const { draft } = route.params;
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [bring, setBring] = useState(true);
  const [notes, setNotes] = useState('');

  return (
    <Screen backgroundColor="white">
      <StepProgress step={6} total={6} label="Final details" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}>
        <Text style={{ fontWeight: '900', marginBottom: 8 }}>Budget Range (Optional)</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input label="KES Min" value={min} onChangeText={setMin} placeholder="Min" keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="KES Max" value={max} onChangeText={setMax} placeholder="Max" keyboardType="number-pad" />
          </View>
        </View>
        <Text style={{ color: colors.muted, marginTop: -6, marginBottom: 10 }}>Providers can still quote outside this range</Text>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontWeight: '900' }}>Provider should bring materials?</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>Turn this on if you need the provider to supply materials. They'll include the cost in their quote.</Text>
            </View>
            <Switch value={bring} onValueChange={setBring} />
          </View>
        </Card>

        <Text style={{ fontWeight: '900', marginTop: 16, marginBottom: 8 }}>Additional Notes (Optional)</Text>
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#F9FAFB', padding: 12 }}>
          <Text
            style={{ color: notes ? colors.text : colors.muted }}
            onPress={() => {}}
          >
            {notes || 'Any special requirements, access instructions, or preferences...\n\n e.g. "Gate code is 1234" or "Call when you arrive"'}
          </Text>
        </View>

        <Card style={{ marginTop: 14, backgroundColor: colors.blueSoft }}>
          <Text style={{ fontWeight: '900' }}>✅ Almost done!</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>After submitting, providers in your area will review your request and send quotes. You'll be notified as they arrive.</Text>
        </Card>

        <View style={{ marginTop: 16 }}>
          <PrimaryButton
            title="Review Request"
            onPress={() =>
              navigation.navigate('ReviewRequest', {
                draft: {
                  ...draft,
                  budgetMin: min ? Number(min) : null,
                  budgetMax: max ? Number(max) : null,
                  providerBringsMaterials: bring,
                  notes,
                },
              })
            }
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
