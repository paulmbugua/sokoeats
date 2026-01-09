import React from 'react';
import { View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import tw from '../../tailwind';
import PaymentWidget from './PaymentWidget.native';

export default function BuyTokensNative() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Match your global footer overlay height (FooterNav area)
  const FOOTER_OVERLAY_PX = 84;

  // Extra bottom space so inline widget content isn't hidden by FooterNav
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'left', 'right']}>
      <View
        style={[
          tw`flex-1 px-4 pt-4`,
          {
            paddingBottom: bottomPad,
          },
        ]}
      >
        {/* Inline feels like a “page”, no extra modal on top of a screen */}
        <PaymentWidget
          isOpen
          onClose={() => {
            try {
              (navigation as any).goBack?.();
            } catch {
              // ignore
            }
          }}
          variant="inline"
          title="Buy Tokens"
          // Optional: cap the internal scroll height so it scrolls nicely above the footer
          maxInlineHeight={undefined}
        />
      </View>
    </SafeAreaView>
  );
}
