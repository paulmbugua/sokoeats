import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { colors, spacing, radius } from '../../theme/tokens';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';

const quick = ['Tap is dripping constantly', 'No power in one room', 'Wall has cracks and needs repainting', 'Fridge not cooling properly', 'Door handle broken'];

export default function DescribeIssueScreen({ route, navigation }: any) {
  const { categoryId, categoryName, serviceId, serviceName } = route.params;
  const [desc, setDesc] = useState(serviceName);

  const draft = {
    categoryId,
    categoryName,
    serviceId,
    serviceName,
    description: desc,
    photoUrls: [] as string[],
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <StepProgress step={2} total={6} label="Describe the problem" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0 }}>
        <Text style={{ fontWeight: '900', marginBottom: 8 }}>What needs to be done?</Text>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          multiline
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, minHeight: 90, backgroundColor: '#F9FAFB' }}
        />
        <Text style={{ color: colors.muted, marginTop: 6 }}>{`${desc.length}/500 characters`}</Text>

        <Card style={{ marginTop: 14, backgroundColor: colors.blueSoft }}>
          <Text style={{ fontWeight: '900' }}>💡 Quick prompts:</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {quick.map((q) => (
              <Chip key={q} label={q} onPress={() => setDesc(q)} />
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>💡 Tip for better quotes:</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>• Be specific about what's broken or needed</Text>
          <Text style={{ color: colors.muted }}>• Mention when the problem started</Text>
          <Text style={{ color: colors.muted }}>• Include any relevant details (room size, material, etc.)</Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton title="Continue" onPress={() => navigation.navigate('PhotoUpload', { draft: { ...draft, description: desc } })} />
        </View>
      </ScrollView>
    </View>
  );
}
