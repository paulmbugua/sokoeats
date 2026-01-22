// apps/mobile/src/screens/Navbar.native.tsx
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import tw from '../../tailwind';
import type { MainStackParamList } from '../navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';
import { useThemePref } from '../theme/ThemeContext';

type NavProp = StackNavigationProp<MainStackParamList>;
type MIName = React.ComponentProps<typeof MaterialIcons>['name'];

type NavbarItem = {
  key?: string;
  label: string;
  route?: keyof MainStackParamList;
  onPress?: () => void;
  icon?: MIName;
  badgeCount?: number;
  accessibilityLabel?: string;
};

type Props = {
  items?: NavbarItem[];
  activeRouteName?: keyof MainStackParamList | string;
  title?: string;
  subtitle?: string;
  onPressSearch?: () => void;
  onPressFilter?: () => void;
};

const BAR = { rowH: 'h-11', pill: 'h-9' };
const UNDERLINE_H = 2;

// ✅ Beautiful icon colors per route (icons only)
const ROUTE_ICON_COLORS: Partial<Record<keyof MainStackParamList, string>> = {
  FindTutor: '#ec4899', // pink-500
  Courses: '#10b981', // emerald-500
  Resources: '#0ea5e9', // sky-500
  Messages: '#8b5cf6', // violet-500
  OrgProfile: '#f59e0b', // amber-500
  InstitutionLogin: '#f59e0b', // amber-500
};

function safeActiveKey(x: any): string {
  return String(x ?? '').trim();
}

const NavbarNative: React.FC<Props> = ({
  items,
  activeRouteName,
  title = 'Daybreak',
  subtitle = 'Find tutors, courses, and resources',
  onPressSearch,
  onPressFilter,
}) => {
  const navigation = useNavigation<NavProp>();
  const { orgToken } = useShopContext();
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';

  const [currentRoute, setCurrentRoute] = useState<string>('');

  // Read current route safely
  useEffect(() => {
    const read = () => {
      try {
        const s: any = (navigation as any)?.getState?.();
        const name = s?.routes?.[s?.index ?? 0]?.name ?? '';
        setCurrentRoute(name);
      } catch {
        setCurrentRoute('');
      }
    };

    read();
    const unsub = (navigation as any)?.addListener?.('state', read);
    return () => (typeof unsub === 'function' ? unsub() : undefined);
  }, [navigation]);

  const go = useCallback(
    (name: keyof MainStackParamList, params?: any) => {
      try {
        // @ts-ignore
        navigation.navigate(name as never, params as never);
      } catch {
        // ignore
      }
    },
    [navigation]
  );

  const defaultItems = useMemo<NavbarItem[]>(
    () => [
      { label: 'Find Tutor', route: 'FindTutor', icon: 'person-search' },
      { label: 'My Courses', route: 'Courses', icon: 'menu-book' },
      { label: 'Resources', route: 'Resources', icon: 'auto-stories' },
      { label: 'Messages', route: 'Messages', icon: 'chat-bubble-outline' },
      {
        label: 'Institutions',
        route: (orgToken ? 'OrgProfile' : 'InstitutionLogin') as keyof MainStackParamList,
        icon: 'business',
      },
    ],
    [orgToken]
  );

  const navItems = items ?? defaultItems;

  const activeKey = safeActiveKey(activeRouteName ?? currentRoute);
  const headerVisible = Boolean(title || subtitle);

  const scrollRef = useRef<ScrollView | null>(null);
  const pillLayouts = useRef<Record<string, { x: number; width: number }>>({});

  // underline translate (native driver safe)
  const underlineX = useRef(new Animated.Value(0)).current;
  const underlineOpacity = useRef(new Animated.Value(0)).current;
  const activeGlow = useRef(new Animated.Value(0)).current;

  const pillBaseStyle = useMemo(
    () => [
      styles.pill,
      {
        backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.75)',
        borderColor: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)',
      },
    ],
    [isDark]
  );

  const pillActiveStyle = useMemo(
    () => [
      styles.pillActive,
      {
        backgroundColor: isDark ? '#0f172a' : '#111827',
        borderColor: isDark ? 'rgba(56,189,248,0.35)' : 'rgba(15,23,42,0.8)',
      },
    ],
    [isDark]
  );

  const themeStyles = useMemo(
    () => ({
      activeGlow: {
        backgroundColor: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(14,165,233,0.18)',
      },
      badge: {
        backgroundColor: isDark ? '#f97316' : '#ef4444',
        borderColor: isDark ? 'rgba(251,146,60,0.8)' : 'rgba(239,68,68,0.8)',
      },
      container: {
        elevation: isDark ? 4 : 6,
        shadowColor: isDark ? '#020617' : '#0f172a',
        shadowOpacity: isDark ? 0.12 : 0.08,
      },
      iconButton: {
        backgroundColor: isDark ? 'rgba(30,41,59,0.55)' : 'rgba(148,163,184,0.12)',
        borderColor: isDark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.2)',
      },
      iconButtonPressed: {
        backgroundColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(148,163,184,0.2)',
      },
      underline: {
        backgroundColor: isDark ? 'rgba(56,189,248,0.85)' : 'rgba(14,165,233,0.95)',
      },
    }),
    [isDark]
  );

  // Keep underline + glow in sync with active pill
  useEffect(() => {
    const match = navItems.find((item) => item.route === (activeKey as any));
    const key = match?.key ?? match?.label ?? activeKey;
    const layout = key ? pillLayouts.current[key] : undefined;

    if (layout) {
      underlineOpacity.setValue(1);
      Animated.spring(underlineX, {
        toValue: layout.x + Math.max(0, (layout.width - styles.underline.width) / 2),
        useNativeDriver: true,
        tension: 120,
        friction: 16,
      }).start();

      scrollRef.current?.scrollTo({
        x: Math.max(layout.x - 48, 0),
        animated: true,
      });
    }

    activeGlow.setValue(0);
    Animated.timing(activeGlow, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [activeGlow, activeKey, navItems, underlineOpacity, underlineX]);

  const handleItemPress = useCallback(
    (item: NavbarItem) => {
      if (item.onPress) return item.onPress();
      if (item.route) return go(item.route);
      return undefined;
    },
    [go]
  );

  // ✅ FIX: Search/Filter always respond (fallback navigation if no handler provided)
  const handleSearchPress = useCallback(() => {
    if (onPressSearch) return onPressSearch();

    // sensible fallback behavior
    if (activeKey === 'Resources') return go('Resources', { openSearch: true });
    if (activeKey === 'FindTutor') return go('FindTutor', { openSearch: true });

    // default to tutor search (most useful)
    return go('FindTutor', { openSearch: true });
  }, [onPressSearch, activeKey, go]);

  const handleFilterPress = useCallback(() => {
    if (onPressFilter) return onPressFilter();

    // sensible fallback behavior
    if (activeKey === 'Resources') return go('Resources', { openFilters: true });
    if (activeKey === 'FindTutor') return go('FindTutor', { openFilters: true });

    // default to tutor filters
    return go('FindTutor', { openFilters: true });
  }, [onPressFilter, activeKey, go]);

  return (
    <View
      style={[
        styles.container,
        themeStyles.container,
        tw`bg-white/70 dark:bg-[#0b121a]/75 border-b border-gray-200/80 dark:border-darkCard pt-2 pb-2`,
      ]}
    >
      {headerVisible && (
        <View style={tw`px-4 ${BAR.rowH} flex-row items-center justify-between`}>
          <View style={tw`flex-1`}>
            {Boolean(title) && (
              <Text style={tw`text-[15px] font-semibold text-gray-900 dark:text-gray-100`}>
                {title}
              </Text>
            )}
            {Boolean(subtitle) && (
              <Text style={tw`text-[12px] text-gray-500 dark:text-gray-400 mt-0.5`}>
                {subtitle}
              </Text>
            )}
          </View>

          {/* ✅ Always clickable */}
          <View style={tw`flex-row items-center gap-2 ml-3`}>
            <Pressable
              accessibilityLabel="Search"
              accessibilityRole="button"
              onPress={handleSearchPress}
              style={({ pressed }) => [
                styles.iconButton,
                themeStyles.iconButton,
                pressed && [styles.iconButtonPressed, themeStyles.iconButtonPressed],
              ]}
            >
              <MaterialIcons
                name="search"
                size={18}
                // a little pop of color
                color={isDark ? '#38bdf8' : '#0ea5e9'}
              />
            </Pressable>

            <Pressable
              accessibilityLabel="Filter"
              accessibilityRole="button"
              onPress={handleFilterPress}
              style={({ pressed }) => [
                styles.iconButton,
                themeStyles.iconButton,
                pressed && [styles.iconButtonPressed, themeStyles.iconButtonPressed],
              ]}
            >
              <MaterialIcons
                name="tune"
                size={18}
                // a little pop of color
                color={isDark ? '#a78bfa' : '#7c3aed'}
              />
            </Pressable>
          </View>
        </View>
      )}

      <View style={tw`mt-1`}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={tw`px-3 pb-1`}
        >
          <View style={styles.pillRow}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.underline,
                themeStyles.underline,
                {
                  opacity: underlineOpacity,
                  transform: [{ translateX: underlineX }],
                },
              ]}
            />

            {navItems.map((item) => {
              const key = item.key ?? item.label;
              const isActive = item.route === (activeKey as any);

              // ✅ colored icons per pill (icons only)
              const routeColor =
                (item.route && ROUTE_ICON_COLORS[item.route]) ||
                (isDark ? '#cbd5f5' : '#64748b');

              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={item.accessibilityLabel ?? item.label}
                  onPress={() => handleItemPress(item)}
                  onLayout={(event) => {
                    const { x, width } = event.nativeEvent.layout;
                    pillLayouts.current[key] = { x, width };
                  }}
                  style={({ pressed }) => [
                    pillBaseStyle,
                    isActive && pillActiveStyle,
                    pressed && styles.pillPressed,
                  ]}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.activeGlow,
                      themeStyles.activeGlow,
                      { opacity: isActive ? activeGlow : 0 },
                    ]}
                  />

                  <View style={tw`flex-row items-center gap-1.5 px-3 ${BAR.pill}`}>
                    {item.icon && (
                      <MaterialIcons
                        name={item.icon}
                        size={15}
                        // keep icon color vivid even when active
                        color={routeColor}
                      />
                    )}

                    <Text
                      style={tw`${isActive ? 'text-white' : 'text-gray-700 dark:text-gray-200'} text-[12px] font-medium`}
                    >
                      {item.label}
                    </Text>

                    {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                      <View style={[styles.badge, themeStyles.badge]}>
                        <Text style={tw`text-[10px] text-white font-semibold`}>
                          {item.badgeCount > 99 ? '99+' : item.badgeCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  activeGlow: {
    backgroundColor: 'rgba(14,165,233,0.18)',
    borderRadius: 999,
    bottom: -8,
    left: -8,
    position: 'absolute',
    right: -8,
    top: -8,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    marginLeft: 4,
    minWidth: 18,
    paddingHorizontal: 5,
  },
  container: {
    elevation: 6,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderColor: 'rgba(148,163,184,0.2)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconButtonPressed: {
    backgroundColor: 'rgba(148,163,184,0.2)',
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderColor: 'rgba(148,163,184,0.35)',
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillActive: {
    backgroundColor: '#111827',
    borderColor: 'rgba(15,23,42,0.8)',
  },
  pillPressed: {
    transform: [{ scale: 0.98 }],
  },
  pillRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
  },
  underline: {
    borderRadius: 999,
    bottom: -2,
    height: UNDERLINE_H,
    position: 'absolute',
    width: 28, // fixed width => native-driver translate safe
  },
});

export default memo(NavbarNative);
