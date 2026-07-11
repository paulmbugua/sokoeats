import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { colors, spacing, radius } from '../../theme/tokens';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';

const categoryTemplates: Record<string, string[]> = {
  plumbing: [
    'There is a {service} issue causing leakage or poor water flow. Please inspect, repair and advise if parts are needed.',
    'I need help with {service}. The affected area is the kitchen/bathroom and I need the pro to bring plumbing tools.',
    'The {service} problem may need urgent attention. Please quote labour and materials separately.',
  ],
  electrical: [
    'I need a qualified electrician for {service}. Please diagnose safely, repair and test before leaving.',
    'There is a {service} fault affecting one room or fitting. Please inspect the wiring, switch/socket and breaker.',
    'The {service} issue may be unsafe. Please bring testing tools and quote parts separately.',
  ],
  painting: [
    'I need {service}. Please include wall preparation, labour, number of coats and paint materials in the quote.',
    'The walls need {service} with patching, sanding and neat finishing.',
    'Please quote {service} with cleanup after the job and the expected duration.',
  ],
  carpentry: [
    'I need {service}. Please inspect alignment, fittings and any replacement hardware needed.',
    'The woodwork needs {service} with neat finishing and strong installation.',
    'Please quote {service} with labour, materials and expected completion time.',
  ],
  cleaning: [
    'I need {service}. Please include rooms/areas covered, supplies, equipment and expected cleaning time.',
    'The place needs {service} with attention to stains, dust, kitchen/bathroom areas and cleanup.',
    'Please quote {service} with team size, supplies included and any extra charges clearly separated.',
  ],
  masonry: [
    'I need {service}. Please inspect the damaged area, quote materials and leave a neat finish.',
    'The surface needs {service} with proper preparation, leveling and cleanup after work.',
    'Please quote {service} and mention if matching tiles/cement/plaster materials are needed.',
  ],
  appliances: [
    'The appliance needs {service}. Please diagnose the fault first and quote labour and parts separately.',
    'I need {service}. The appliance turns on/off or behaves abnormally and needs inspection.',
    'Please check {service}, explain the fault and confirm if replacement parts are required.',
  ],
  security: [
    'I need {service}. Please inspect, repair or install securely and test before completion.',
    'The security issue needs {service}. Please quote reliable parts, labour and expected arrival time.',
    'Please handle {service} neatly and confirm the system/lock works before leaving.',
  ],
  gardening: [
    'I need {service}. Please include trimming, clearing, waste collection and tools needed.',
    'The outdoor area needs {service}. Please quote labour, duration and disposal separately.',
    'Please do {service} and leave the compound clean after the job.',
  ],
  'pest-control': [
    'I need {service}. Please mention target pests, rooms affected, safety steps and re-entry time.',
    'There is a pest issue and I need {service}. Please inspect affected rooms and explain preparation needed.',
    'Please quote {service} using safe treatment and include follow-up advice.',
  ],
  moving: [
    'I need {service}. Please quote vehicle size, helpers, loading, transport and offloading.',
    'Please help with {service}. I have furniture/appliances that need careful handling.',
    'I need {service} between estates. Please include estimated trips, arrival time and labour.',
  ],
  solar: [
    'I need {service}. Please diagnose panels, battery, inverter/controller and wiring before quoting repair.',
    'The solar or backup power system needs {service}. Please test charging, battery health and output.',
    'Please inspect {service} and quote parts and labour separately.',
  ],
};

const categoryTips: Record<string, string[]> = {
  plumbing: ['Mention the exact leak point or fixture.', 'Say if water is still running or shut off.', 'Add photos of pipes, taps or drains.'],
  electrical: ['Mention what trips or stops working.', 'Say if it affects one room or the whole house.', 'Do not open live fittings before the pro arrives.'],
  painting: ['Mention room count or wall size.', 'Say if patching, sanding or primer is needed.', 'State preferred colour or paint brand if known.'],
  carpentry: ['Mention item size and material.', 'Say if hinges, locks or runners are damaged.', 'Add photos of the affected fitting.'],
  cleaning: ['Mention room count and key dirty areas.', 'Say if supplies should be brought.', 'State if it is move-in, move-out or post-renovation.'],
  masonry: ['Mention damaged area size.', 'Say if matching materials are available.', 'Add if there is dampness or water damage.'],
  appliances: ['Mention brand/model if known.', 'Describe sounds, leaks or error codes.', 'Say when the issue started.'],
  security: ['Mention urgency and access needs.', 'Say if repair or replacement is needed.', 'Add photos of the lock, camera or alarm.'],
  gardening: ['Mention compound size.', 'Say if waste disposal is needed.', 'State whether tools should be brought.'],
  'pest-control': ['Mention pest type and affected rooms.', 'Say if children or pets are present.', 'Ask for safety and re-entry guidance.'],
  moving: ['Mention pickup and drop-off estates.', 'List heavy or fragile items.', 'Say if packing is needed.'],
  solar: ['Mention battery/inverter brand if known.', 'Describe charging or backup symptoms.', 'Say if the system is off-grid or backup only.'],
};

function id(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildPrompts(categoryId: unknown, categoryName: string, serviceName: string) {
  const categoryKey = id(categoryId || categoryName);
  const service = serviceName || 'the selected service';
  const lowerService = service.toLowerCase();
  const base = categoryTemplates[categoryKey] || [
    'I need help with {service}. Please inspect the problem, quote labour and materials separately, and confirm availability.',
    'The issue is related to {service}. Please bring the right tools and advise if parts are needed.',
    'Please quote {service} with expected duration, materials and total cost.',
  ];
  const prompts = base.map((prompt) => prompt.replaceAll('{service}', lowerService));

  if (lowerService.includes('leak') || lowerService.includes('tap') || lowerService.includes('drain')) {
    prompts.unshift('The ' + lowerService + ' issue is causing water leakage or slow drainage. I need a quick fix and cleanup after repair.');
  }
  if (lowerService.includes('power') || lowerService.includes('socket') || lowerService.includes('switch')) {
    prompts.unshift('The ' + lowerService + ' issue may be unsafe. Please diagnose the fault, repair it and test the circuit.');
  }
  if (lowerService.includes('fridge') || lowerService.includes('washing')) {
    prompts.unshift('The ' + lowerService + ' is not working correctly. Please diagnose before replacing any parts.');
  }
  if (lowerService.includes('cctv') || lowerService.includes('lock')) {
    prompts.unshift('I need ' + lowerService + ' handled securely. Please confirm parts, labour and testing after the job.');
  }

  return Array.from(new Set(prompts)).slice(0, 5).map(title);
}

function buildTips(categoryId: unknown, categoryName: string) {
  return categoryTips[id(categoryId || categoryName)] || ['Describe what is broken or needed.', 'Mention when the issue started.', 'Add photos for accurate quotes.'];
}

export default function DescribeIssueScreen({ route, navigation }: any) {
  const { categoryId, categoryName, serviceId, serviceName } = route.params;
  const [desc, setDesc] = useState(serviceName);
  const quickPrompts = useMemo(() => buildPrompts(categoryId, categoryName, serviceName), [categoryId, categoryName, serviceName]);
  const tips = useMemo(() => buildTips(categoryId, categoryName), [categoryId, categoryName]);

  const draft = {
    categoryId,
    categoryName,
    serviceId,
    serviceName,
    description: desc,
    photoUrls: [] as string[],
  };

  return (
    <Screen backgroundColor="white">
      <StepProgress step={2} total={6} label="Describe the problem" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}>
        <Text style={{ color: colors.primary, fontWeight: '900', marginBottom: 6 }}>{categoryName}</Text>
        <Text style={{ fontWeight: '900', marginBottom: 8 }}>What needs to be done for {serviceName}?</Text>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          multiline
          maxLength={500}
          placeholder="Describe the problem, affected area, urgency and any parts already available."
          placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, minHeight: 118, backgroundColor: '#F9FAFB', textAlignVertical: 'top', color: colors.text }}
        />
        <Text style={{ color: colors.muted, marginTop: 6 }}>{desc.length}/500 characters</Text>

        <Card style={{ marginTop: 14, backgroundColor: colors.blueSoft }}>
          <Text style={{ fontWeight: '900' }}>Quick prompts for {serviceName}</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Tap one to start with a quote-ready description, then edit it.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {quickPrompts.map((prompt) => (
              <Chip key={prompt} label={prompt} active={desc === prompt} onPress={() => setDesc(prompt)} style={{ maxWidth: '100%' }} />
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Tip for better quotes</Text>
          {tips.map((tip) => (
            <Text key={tip} style={{ color: colors.muted, marginTop: 6 }}>- {tip}</Text>
          ))}
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton title="Continue" onPress={() => navigation.navigate('PhotoUpload', { draft: { ...draft, description: desc } })} />
        </View>
      </ScrollView>
    </Screen>
  );
}
