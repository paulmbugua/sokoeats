import React, { forwardRef } from 'react';
import {
  RefreshControl,
  ScrollView,
  FlatList,
  type ScrollViewProps,
  type FlatListProps,
  Platform,
} from 'react-native';
import { useGlobalRefresh } from './GlobalRefreshProvider';

// ✅ Allow custom props for analytics/debug/etc.
// NOTE: we intentionally do NOT forward screenId to the native ScrollView/FlatList.
export type RefreshableScrollViewProps = ScrollViewProps & {
  screenId?: string;
};

export const RefreshableScrollView = forwardRef<ScrollView, RefreshableScrollViewProps>(
  (props, ref) => {
    const { refreshing, refresh } = useGlobalRefresh();

    // ✅ strip custom props so RN components don't receive unknown props
    const { screenId: _screenId, contentContainerStyle, ...restProps } = props;

    return (
      <ScrollView
        ref={ref}
        // Make sure the pull can engage even if content is short:
        contentContainerStyle={[{ flexGrow: 1, minHeight: '120%' }, contentContainerStyle]}
        // On iOS/Android make overscroll possible
        alwaysBounceVertical
        overScrollMode="always"
        // Pull-to-refresh wired to global refresh
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            // visual tweaks (dark app)
            tintColor="#fff" // iOS spinner
            colors={['#0ea5e9']} // Android spinner colors
            progressBackgroundColor="#0f172a"
            progressViewOffset={Platform.select({ android: 56, ios: 0 })}
          />
        }
        {...restProps}
      />
    );
  }
);

RefreshableScrollView.displayName = 'RefreshableScrollView';

// ✅ Optional: mirror the same capability on FlatList too
export type RefreshableFlatListProps<ItemT> = FlatListProps<ItemT> & {
  screenId?: string;
};

export function RefreshableFlatList<ItemT>(props: RefreshableFlatListProps<ItemT>) {
  const { refreshing, refresh } = useGlobalRefresh();

  const { screenId: _screenId, contentContainerStyle, ...restProps } = props;

  return (
    <FlatList
      // Same idea: allow pull even with few items
      contentContainerStyle={[{ paddingBottom: 16, minHeight: '120%' }, contentContainerStyle]}
      refreshing={refreshing}
      onRefresh={refresh}
      {...restProps}
    />
  );
}
