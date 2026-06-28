import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/tokens';

const FOOTER_CLEARANCE = 36;
const KEYBOARD_OFFSET_IOS = 88;

type ScreenProps = {
  children: ReactNode;
  backgroundColor?: string;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
};

type ScreenScrollProps = ScreenProps &
  Pick<ScrollViewProps, 'refreshControl'> & {
    contentContainerStyle?: StyleProp<ViewStyle>;
    scrollProps?: Omit<
      ScrollViewProps,
      'children' | 'contentContainerStyle' | 'keyboardShouldPersistTaps' | 'refreshControl'
    >;
  };

export function Screen({
  children,
  backgroundColor = colors.bg,
  contentStyle,
  keyboard = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[
        { flex: 1, backgroundColor },
        contentStyle,
        { paddingBottom: Math.max(insets.bottom, FOOTER_CLEARANCE) },
      ]}
    >
      {children}
    </SafeAreaView>
  );

  if (!keyboard) return body;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? KEYBOARD_OFFSET_IOS : 0}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

export function ScreenScroll({
  children,
  backgroundColor = colors.bg,
  contentContainerStyle,
  contentStyle,
  keyboard = true,
  refreshControl,
  scrollProps,
}: ScreenScrollProps) {
  const insets = useSafeAreaInsets();
  const bottomSpace = Math.max(insets.bottom, FOOTER_CLEARANCE) + spacing.xl;

  return (
    <Screen backgroundColor={backgroundColor} contentStyle={contentStyle} keyboard={keyboard}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}
        {...scrollProps}
        contentContainerStyle={[
          {
            flexGrow: 1,
            padding: spacing.xl,
            paddingBottom: bottomSpace,
          },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
    </Screen>
  );
}
