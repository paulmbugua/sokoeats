import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import tw from '../../tailwind';

// Hint IDs in use:
// lesson_overlay_v1
// org_roster_add_v1
// org_announcements_publish_v1
// org_exam_flow_v1
// org_fees_quick_actions_v1
// account_transactions_v1
// account_sessions_v1

export type CoachmarkPlacement = 'top' | 'bottom' | 'left' | 'right';

const hintStorageKey = (id: string) => `hint_seen:${id}`;

export const useCoachmark = (id: string, eligible: boolean) => {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(hintStorageKey(id))
      .then((value) => {
        if (!active) return;
        setSeen(Boolean(value));
      })
      .catch(() => {
        if (!active) return;
        setSeen(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const visible = Boolean(eligible && seen === false);

  const dismiss = useCallback(async () => {
    setSeen(true);
    try {
      await AsyncStorage.setItem(hintStorageKey(id), '1');
    } catch {
      // ignore write errors
    }
  }, [id]);

  return { visible, dismiss };
};

type CoachmarkProps = {
  id: string;
  title: string;
  text: string;
  visible: boolean;
  onDismiss: () => void;
  placement?: CoachmarkPlacement;
};

export const Coachmark: React.FC<CoachmarkProps> = ({
  id,
  title,
  text,
  visible,
  onDismiss,
  placement = 'top',
}) => {
  const placementStyle = useMemo(() => {
    switch (placement) {
      case 'bottom':
        return { top: '100%', left: 0, marginTop: 8 };
      case 'left':
        return { right: '100%', top: 0, marginRight: 8 };
      case 'right':
        return { left: '100%', top: 0, marginLeft: 8 };
      default:
        return { bottom: '100%', left: 0, marginBottom: 8 };
    }
  }, [placement]);

  if (!visible) return null;

  return (
    <View
      accessibilityLabel={`Hint: ${id}`}
      style={[
        tw`absolute z-50 max-w-[240px] rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-white dark:bg-[#0f1821] p-3 shadow-lg`,
        placementStyle as any,
      ]}
    >
      <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>{title}</Text>
      <Text style={tw`mt-1 text-[11px] text-[#475569] dark:text-white/70`}>{text}</Text>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        style={tw`mt-2 self-start rounded-full bg-indigo-600/90 px-3 py-1`}
      >
        <Text style={tw`text-[11px] font-semibold text-white`}>Got it</Text>
      </Pressable>
    </View>
  );
};

