import React, { forwardRef, useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  FlatList,
  type ScrollViewProps,
  type FlatListProps,
} from 'react-native';
import { useGlobalRefresh } from './GlobalRefreshProvider';

export type RefreshableScrollViewProps = ScrollViewProps & {
  screenId?: string;
  refreshEnabled?: boolean;
};

export const RefreshableScrollView = forwardRef<ScrollView, RefreshableScrollViewProps>(
  (props, ref) => {
    const { refreshing, refresh } = useGlobalRefresh();

    const {
      screenId: _screenId,
      refreshEnabled = true,
      contentContainerStyle,
      refreshControl: refreshControlProp,
      ...restProps
    } = props;

    const refreshControl = useMemo(() => {
      // If caller provided a RefreshControl, clone it and force-enable/disable it
      if (refreshControlProp && React.isValidElement(refreshControlProp)) {
        return React.cloneElement(refreshControlProp as any, {
          enabled: refreshEnabled,
          refreshing: refreshEnabled ? Boolean(refreshing) : false,
          onRefresh: refreshEnabled ? refresh : undefined,
        });
      }

      // Always mount RefreshControl (key fix). Only toggle enabled/handlers.
      return (
        <RefreshControl
          refreshing={refreshEnabled ? Boolean(refreshing) : false}
          onRefresh={refreshEnabled ? refresh : undefined}
          enabled={refreshEnabled}
          tintColor="#fff"
          colors={['#0ea5e9']}
          progressBackgroundColor="#0f172a"
        />
      );
    }, [refreshEnabled, refreshControlProp, refreshing, refresh]);

    return (
      <ScrollView
        ref={ref}
        // ✅ keep stable; no percentage minHeight
        contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
        // ✅ keep stable; don’t toggle these based on refreshEnabled
        refreshControl={refreshControl}
        {...restProps}
      />
    );
  }
);

RefreshableScrollView.displayName = 'RefreshableScrollView';

// Optional FlatList wrapper (same idea)
export type RefreshableFlatListProps<ItemT> = FlatListProps<ItemT> & {
  screenId?: string;
  refreshEnabled?: boolean;
};

export function RefreshableFlatList<ItemT>(props: RefreshableFlatListProps<ItemT>) {
  const { refreshing, refresh } = useGlobalRefresh();

  const {
    screenId: _screenId,
    refreshEnabled = true,
    contentContainerStyle,
    refreshing: _ignoredRefreshing,
    onRefresh: _ignoredOnRefresh,
    ...restProps
  } = props;

  return (
    <FlatList
      contentContainerStyle={[{ paddingBottom: 16, flexGrow: 1 }, contentContainerStyle]}
      refreshing={refreshEnabled ? Boolean(refreshing) : false}
      onRefresh={refreshEnabled ? refresh : undefined}
      {...restProps}
    />
  );
}
