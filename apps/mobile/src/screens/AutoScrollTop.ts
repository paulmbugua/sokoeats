import { useCallback, RefObject } from 'react';
import { ScrollView } from 'react-native';
import { useScrollToTop, useFocusEffect } from '@react-navigation/native';

export function useAutoScrollTop(ref: RefObject<ScrollView | any>, onFocus = true) {
  useScrollToTop(ref);
  useFocusEffect(
    useCallback(() => {
      if (!onFocus) return;
      ref.current?.scrollTo?.({ y: 0, animated: false });
    }, [onFocus])
  );
}
