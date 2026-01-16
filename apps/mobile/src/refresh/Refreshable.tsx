import React, { forwardRef, useMemo } from 'react';
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
  /** ✅ Control whether pull-to-refresh is enabled (defaults to true). */
  refreshEnabled?: boolean;
};

export const RefreshableScrollView = forwardRef<ScrollView, RefreshableScrollViewProps>(
  (props, ref) => {
    const { refreshing, refresh } = useGlobalRefresh();

    // ✅ strip custom props so RN components don't receive unknown props
    const {
      screenId: _screenId,
      refreshEnabled = true,
      contentContainerStyle,
      refreshControl: refreshControlProp, // ✅ allow override if needed, but keep enabled behavior
      ...restProps
    } = props;

    const refreshControl = useMemo(() => {
      // ✅ If disabled: DO NOT mount RefreshControl at all (fixes horizontal-scroll conflict)
      if (!refreshEnabled) return undefined;

      // ✅ If caller passed a refreshControl, keep it, but only if refresh is enabled
      if (refreshControlProp) return refreshControlProp;

      return (
        <RefreshControl
          refreshing={Boolean(refreshing)}
          onRefresh={refresh}
          enabled={refreshEnabled} // ✅ critical on Android
          // visual tweaks (dark app)
          tintColor="#fff" // iOS spinner
          colors={['#0ea5e9']} // Android spinner colors
          progressBackgroundColor="#0f172a"
          progressViewOffset={Platform.select({ android: 56, ios: 0 })}
        />
      );
    }, [refreshEnabled, refreshControlProp, refreshing, refresh]);

    return (
      <ScrollView
        ref={ref}
        // Make sure the pull can engage even if content is short:
        contentContainerStyle={[{ flexGrow: 1, minHeight: '120%' }, contentContainerStyle]}
        // ✅ When refresh is disabled, reduce parent overscroll eagerness
        alwaysBounceVertical={refreshEnabled}
        overScrollMode={refreshEnabled ? 'always' : 'auto'}
        // ✅ Pull-to-refresh wired to global refresh (or none when disabled)
        refreshControl={refreshControl}
        {...restProps}
      />
    );
  }
);

RefreshableScrollView.displayName = 'RefreshableScrollView';

// ✅ Optional: mirror the same capability on FlatList too
export type RefreshableFlatListProps<ItemT> = FlatListProps<ItemT> & {
  screenId?: string;
  /** ✅ Control whether pull-to-refresh is enabled (defaults to true). */
  refreshEnabled?: boolean;
};

export function RefreshableFlatList<ItemT>(props: RefreshableFlatListProps<ItemT>) {
  const { refreshing, refresh } = useGlobalRefresh();

  const {
    screenId: _screenId,
    refreshEnabled = true,
    contentContainerStyle,
    refreshing: _ignoredRefreshing, // ✅ we own refreshing
    onRefresh: _ignoredOnRefresh, // ✅ we own onRefresh
    ...restProps
  } = props;

  return (
    <FlatList
      // Same idea: allow pull even with few items
      contentContainerStyle={[{ paddingBottom: 16, minHeight: '120%' }, contentContainerStyle]}
      // ✅ Gate pull-to-refresh (FlatList uses these props directly)
      refreshing={refreshEnabled ? Boolean(refreshing) : false}
      onRefresh={refreshEnabled ? refresh : undefined}
      {...restProps}
    />
  );
}
