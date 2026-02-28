import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { colors, spacing, radius } from '../../theme/tokens';
import Card from '../../components/Card';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import { estates } from '../../../../packages/shared/api/kenya-data';

export default function LocationSelectScreen({ route, navigation }: any) {
  const { draft } = route.params;
  const [q, setQ] = useState('');
  const list = useMemo(() => (estates || []).filter((e: any) => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12), [q]);
  const [selected, setSelected] = useState('Kilimani');

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <StepProgress step={4} total={6} label="Where is the job?" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '900' }}>Use Current Location</Text>
        </Card>

        <Text style={{ color: colors.muted, fontWeight: '800', marginTop: 6 }}>Saved Addresses</Text>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '900' }}>Home</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>Kilimani, Nairobi</Text>
        </Card>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '900' }}>Work</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>Westlands, Nairobi</Text>
        </Card>

        <View style={{ marginTop: 12 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search estate or landmark..."
            placeholderTextColor={colors.muted}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#F9FAFB' }}
          />
        </View>

        <Text style={{ marginTop: 14, color: colors.muted, fontWeight: '800' }}>Nairobi Estates</Text>
        <View style={{ marginTop: 10 }}>
          {list.map((e: any) => (
            <Card key={e.id} style={{ marginBottom: 10, borderColor: selected === e.name ? colors.primary : colors.border }}>
              <Text style={{ fontWeight: '900' }} onPress={() => setSelected(e.name)}>
                {e.name}
              </Text>
            </Card>
          ))}
        </View>

        <Card style={{ marginTop: 6, alignItems: 'center' }}>
          <Text style={{ fontWeight: '900' }}>📍 Pin Location on Map</Text>
        </Card>

        <Text style={{ textAlign: 'center', marginTop: 10, color: colors.muted, fontSize: 12 }}>
          Your exact address will only be shared with the provider you choose
        </Text>

        <View style={{ marginTop: 16 }}>
          <PrimaryButton
            title="Continue"
            onPress={() => navigation.navigate('ScheduleSelect', { draft: { ...draft, estate: selected, city: 'Nairobi' } })}
          />
        </View>
      </ScrollView>
    </View>
  );
}
