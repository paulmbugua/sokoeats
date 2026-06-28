import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import StepProgress from '../../components/StepProgress';
import { categories } from '@myhandymanapp/shared/api/kenya-data';
import { Screen } from '../../components/Screen';

export default function CategorySelectScreen({ navigation }: any) {
  return (
    <Screen backgroundColor="white">
      <StepProgress step={1} total={6} label="Choose a service" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}>
        <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 12 }}>What do you need fixed?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(categories || []).map((c: any) => (
            <Card key={c.id} style={{ width: '48%', paddingVertical: 18 }}>
              <Text style={{ fontWeight: '900' }}>{c.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>Tap to choose</Text>
              <Text
                style={{ marginTop: 10, color: colors.primary, fontWeight: '800' }}
                onPress={() => navigation.navigate('TaskSelect', { categoryId: c.id, categoryName: c.name })}
              >
                Select →
              </Text>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
