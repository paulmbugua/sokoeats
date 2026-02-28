import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';

export default function PhotoUploadScreen({ route, navigation }: any) {
  const { draft } = route.params;
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <StepProgress step={3} total={6} label="Upload photos (optional)" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0 }}>
        <Text style={{ color: colors.muted }}>Photos help providers understand the job better and give more accurate quotes.</Text>
        <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ fontWeight: '900' }}>📷 Add Photo</Text>
        </Card>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <SecondaryButton title="Camera" onPress={() => {}} style={{ flex: 1 }} />
          <SecondaryButton title="Gallery" onPress={() => {}} style={{ flex: 1 }} />
        </View>
        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>🧠 Photo tips:</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>• Capture the problem area clearly</Text>
          <Text style={{ color: colors.muted }}>• Include close-ups and wide shots</Text>
          <Text style={{ color: colors.muted }}>• Ensure good lighting</Text>
          <Text style={{ color: colors.muted }}>• Show any damage or specific details</Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton title="Continue" onPress={() => navigation.navigate('LocationSelect', { draft })} />
          <Text style={{ textAlign: 'center', marginTop: 14, color: colors.muted, fontWeight: '800' }} onPress={() => navigation.navigate('LocationSelect', { draft })}>
            Skip for now
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
