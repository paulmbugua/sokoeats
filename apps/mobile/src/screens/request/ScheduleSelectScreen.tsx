import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, radius } from '../../theme/tokens';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';

type ScheduleType = 'ASAP' | 'TODAY' | 'LATER';

function nextHour() {
  const value = new Date();
  value.setMinutes(0, 0, 0);
  value.setHours(value.getHours() + 1);
  return value;
}

export default function ScheduleSelectScreen({ route, navigation }: any) {
  const { draft } = route.params;
  const [type, setType] = useState<ScheduleType>('ASAP');
  const [date, setDate] = useState(nextHour);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [flexible, setFlexible] = useState(true);

  const scheduledFor = useMemo(() => {
    if (type === 'ASAP') return new Date();
    return date;
  }, [date, type]);

  const chooseType = (next: ScheduleType) => {
    setType(next);
    if (next === 'TODAY') setDate(nextHour());
    if (next === 'LATER') {
      const tomorrow = nextHour();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow);
      setShowDate(true);
    }
  };

  const updateDate = (event: any, value?: Date) => {
    if (Platform.OS === 'android') setShowDate(false);
    if (!value || event.type === 'dismissed') return;
    const next = new Date(date);
    next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    setDate(next);
    if (Platform.OS === 'android') setShowTime(true);
  };

  const updateTime = (event: any, value?: Date) => {
    if (Platform.OS === 'android') setShowTime(false);
    if (!value || event.type === 'dismissed') return;
    const next = new Date(date);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    setDate(next);
  };

  const continueFlow = () => {
    if (type !== 'ASAP' && scheduledFor.getTime() <= Date.now()) {
      Alert.alert('Choose a future time', 'The selected job time has already passed.');
      return;
    }
    navigation.navigate('JobDetails', {
      draft: {
        ...draft,
        scheduleType: type,
        scheduledFor: scheduledFor.toISOString(),
        flexibleSchedule: flexible,
      },
    });
  };

  const options: Array<[ScheduleType, string, string]> = [
    ['ASAP', 'As Soon As Possible', 'Handymen who can start immediately'],
    ['TODAY', 'Today', 'Choose a specific time today'],
    ['LATER', 'Schedule for Later', 'Choose a future date and time'],
  ];

  return (
    <Screen backgroundColor="white">
      <StepProgress step={5} total={6} label="Choose schedule" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}
      >
        {options.map(([value, title, subtitle]) => {
          const selected = type === value;
          return (
            <Pressable
              key={value}
              onPress={() => chooseType(value)}
              style={{
                borderWidth: 2,
                borderColor: selected ? colors.primary : colors.border,
                borderRadius: radius.md,
                padding: 14,
                marginBottom: 12,
                backgroundColor: selected ? '#ECFDF5' : 'white',
              }}
            >
              <Text style={{ fontWeight: '900', fontSize: 15 }}>{title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{subtitle}</Text>
            </Pressable>
          );
        })}

        {type !== 'ASAP' ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              padding: 14,
            }}
          >
            <Text style={{ fontWeight: '900' }}>
              {date.toLocaleDateString('en-KE', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}{' '}
              at{' '}
              {date.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {type === 'LATER' ? (
                <Pressable onPress={() => setShowDate(true)} style={{ flex: 1 }}>
                  <Text style={{ color: colors.primary, fontWeight: '900' }}>Change Date</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setShowTime(true)} style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontWeight: '900' }}>Change Time</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showDate ? (
          <DateTimePicker
            value={date}
            mode="date"
            minimumDate={new Date()}
            onChange={updateDate}
          />
        ) : null}
        {showTime ? (
          <DateTimePicker value={date} mode="time" onChange={updateTime} />
        ) : null}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: flexible }}
          onPress={() => setFlexible((value) => !value)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: colors.primary,
              backgroundColor: flexible ? colors.primary : 'white',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '900' }}>{flexible ? '✓' : ''}</Text>
          </View>
          <Text style={{ flex: 1 }}>My timing is flexible by up to one hour.</Text>
        </Pressable>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton title="Continue" onPress={continueFlow} />
        </View>
      </ScrollView>
    </Screen>
  );
}
