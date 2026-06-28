import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';

export default function ScheduleSelectScreen({ route, navigation }: any) {
  const { draft } = route.params;
  const [sel, setSel] = useState<'ASAP' | 'TODAY' | 'LATER'>('ASAP');

  const Item = ({ title, sub, value }: any) => (
    <Card style={{ marginBottom: 12, borderColor: sel === value ? colors.primary : colors.border }}>
      <Text style={{ fontWeight: '900', fontSize: 15 }} onPress={() => setSel(value)}>
        {title}
      </Text>
      <Text style={{ color: colors.muted, marginTop: 4 }}>{sub}</Text>
    </Card>
  );

  return (
    <Screen backgroundColor="white">
      <StepProgress step={5} total={6} label="Choose schedule" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}>
        <Item title="As Soon As Possible" sub="Providers can start immediately" value="ASAP" />
        <Item title="Today" sub="Complete job today" value="TODAY" />
        <Item title="Schedule for Later" sub="Pick a specific date and time" value="LATER" />

        <Card style={{ marginTop: 6, backgroundColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '900' }}>⏰ Note:</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Providers will confirm the exact time when sending quotes.</Text>
          <Text style={{ color: colors.muted }}>Flexible schedules get more responses.</Text>
        </Card>

        <View style={{ marginTop: 16 }}>
          <PrimaryButton title="Continue" onPress={() => navigation.navigate('JobDetails', { draft: { ...draft, scheduleType: sel } })} />
        </View>
      </ScrollView>
    </Screen>
  );
}
