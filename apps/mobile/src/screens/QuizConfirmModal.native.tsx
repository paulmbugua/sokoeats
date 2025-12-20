// apps/mobile/src/screens/QuizConfirmModal.native.tsx
import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  BackHandler,
  Animated,
  Easing,
  Platform,
  findNodeHandle,
  AccessibilityInfo,
} from 'react-native';
import tw from '../../tailwind';

type QuizConfirmModalProps = {
  open: boolean;
  lessons: number;
  questions: number;
  timeLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const QuizConfirmModal: React.FC<QuizConfirmModalProps> = ({
  open,
  lessons,
  questions,
  timeLabel,
  onCancel,
  onConfirm,
}) => {
  // Animations
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  const titleRef = useRef<View | null>(null);

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        try {
          const handle = findNodeHandle(titleRef.current);
          if (handle) AccessibilityInfo.setAccessibilityFocus?.(handle);
        } catch {
          /* no-op */
        }
      });
    } else {
      fade.setValue(0);
      scale.setValue(0.96);
    }
  }, [open]);

  // Android hardware back
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      accessibilityViewIsModal
    >
      {/* Backdrop */}
      <Animated.View style={[tw`absolute inset-0 bg-black/45`, { opacity: fade }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        onPress={onCancel}
        style={tw`absolute inset-0`}
      />

      {/* Centered Card */}
      <View style={tw`flex-1 items-center justify-center p-4`} pointerEvents="box-none">
        <Animated.View
          style={[
            tw`w-full max-w-[560px] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-transparent`,
            { opacity: fade, transform: [{ scale }] },
          ]}
        >
          {/* Hairline ring */}
          <View
            pointerEvents="none"
            style={tw`absolute inset-0 rounded-2xl border border-black/10 dark:border-white/10`}
          />

          {/* Header */}
          <View style={tw`px-5 pt-5`}>
            <View
              ref={titleRef}
              collapsable={false}
              accessible
              accessibilityRole="header"
              accessibilityLabel="Ready to start your quiz?"
              style={tw`h-11 w-11 items-center justify-center rounded-xl shadow-md bg-indigo-600`}
            >
              {/* Play triangle via borders (inline, RN doesn't have tailwind for this) */}
              <View
                style={{
                  width: 0,
                  height: 0,
                  borderTopWidth: 8,
                  borderBottomWidth: 8,
                  borderLeftWidth: 12,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderLeftColor: '#fff',
                }}
              />
            </View>

            <Text style={tw`mt-3 text-xl font-extrabold text-slate-900 dark:text-white`}>
              Ready to start your quiz?
            </Text>
            <Text style={tw`mt-1 text-sm text-slate-600 dark:text-white/70`}>
              Make sure you’ve reviewed the lesson. The timer (if any) starts immediately.
            </Text>
          </View>

          {/* Summary */}
          <View style={tw`px-5 mt-4`}>
            <View style={tw`flex-row gap-2`}>
              <InfoCard label="Lessons" value={String(lessons)} />
              <InfoCard label="Questions" value={String(questions)} />
              <InfoCard label="Time" value={timeLabel} />
            </View>
          </View>

          {/* Divider */}
          <View style={tw`mt-5 h-px bg-black/10 dark:bg-white/10`} />

          {/* Actions */}
          <View style={tw`px-5 py-3 flex-row justify-end gap-2`}>
            <Pressable
              onPress={onCancel}
              android_ripple={{ color: '#eef2ff', borderless: false }}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              testID="quiz-confirm-cancel"
              style={tw`px-4 py-2 rounded-xl border border-slate-300 dark:border-white/15`}
            >
              <Text style={tw`text-sm font-medium text-slate-700 dark:text-white/90`}>Not now</Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel="Start quiz"
              testID="quiz-confirm-start"
              style={({ pressed }) => [
                tw`px-4 py-2 rounded-xl`,
                pressed ? tw`bg-indigo-500` : tw`bg-indigo-600`,
              ]}
            >
              <Text style={tw`text-sm font-semibold text-white`}>Start quiz</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const InfoCard = ({ label, value }: { label: string; value: string }) => (
  <View
    accessible
    accessibilityLabel={`${label}: ${value}`}
    style={tw`flex-1 items-center rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2.5 py-3`}
  >
    <Text style={tw`text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/60`}>
      {label}
    </Text>
    <Text style={tw`mt-0.5 text-lg font-semibold text-slate-900 dark:text-white`}>{value}</Text>
  </View>
);

export default QuizConfirmModal;
