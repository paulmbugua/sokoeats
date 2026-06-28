import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import StepProgress from '../../components/StepProgress';
import { services } from '@myhandymanapp/shared/api/kenya-data';
import { Screen } from '../../components/Screen';

export default function TaskSelectScreen({ route, navigation }: any) {
  const { categoryId, categoryName } = route.params;
  const list = useMemo(() => (services || []).filter((s: any) => s.categoryId === categoryId), [categoryId]);

  return (
    <Screen backgroundColor="white">
      <StepProgress step={1} total={6} label="Choose a service" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}>
        <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 12 }}>{categoryName}</Text>
        {list.map((s: any) => (
          <Card key={s.id} style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: '900' }}>{s.name}</Text>
            <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 8 }} onPress={() => navigation.navigate('DescribeIssue', { categoryId, categoryName, serviceId: s.id, serviceName: s.name })}>
              Continue →
            </Text>
          </Card>
        ))}
        <Card>
          <Text style={{ fontWeight: '900' }}>Other / Describe custom task</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
