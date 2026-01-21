// apps/mobile/src/screens/Navbar.native.tsx
import React from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
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

const NavbarNative: React.FC<Props> = ({
  items,
  activeRouteName,
  title = 'Explore',
  subtitle = 'Find tutors, courses, and resources',
  onPressSearch,
  onPressFilter,
}) => {
  const navigation = useNavigation<NavProp>();
  const currentRoute = useNavigationState((state) => state.routes[state.index]?.name);
  const { orgToken } = useShopContext();
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';

  const scrollRef = React.useRef<ScrollView | null>(null);
  const pillLayouts = React.useRef<Record<string, { x: number; width: number }>>({});

  const indicatorX = React.useRef(new Animated.Value(0)).current;
  const indicatorW = React.useRef(new Animated.Value(0)).current;
  const indicatorOpacity = React.useRef(new Animated.Value(0)).current;
  const activeGlow = React.useRef(new Animated.Value(0)).current;

  const go = React.useCallback(
    (name: keyof MainStackParamList) => navigation.navigate(name as never),
    [navigation]
  );

  const defaultItems = React.useMemo<NavbarItem[]>(
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
  const activeKey = String(activeRouteName ?? currentRoute ?? '');

  const pillBaseStyle = React.useMemo(
    () => [
      styles.pill,
      {
        backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.75)',
        borderColor: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)',
      },
    ],
    [isDark]
  );

  const pillActiveStyle = React.useMemo(
    () => [
      styles.pillActive,
      {
        backgroundColor: isDark ? '#0f172a' : '#111827',
        borderColor: isDark ? 'rgba(56,189,248,0.35)' : 'rgba(15,23,42,0.8)',
      },
    ],
    [isDark]
  );

  const themeStyles = React.useMemo(
    () => ({
      container: {
        shadowColor: isDark ? '#020617' : '#0f172a',
        shadowOpacity: isDark ? 0.12 : 0.08,
        elevation: isDark ? 4 : 6,
      },
      indicator: {
        backgroundColor: isDark ? 'rgba(56,189,248,0.7)' : 'rgba(14,165,233,0.9)',
      },
      activeGlow: {
        backgroundColor: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(14,165,233,0.18)',
      },
      badge: {
        backgroundColor: isDark ? '#f97316' : '#ef4444',
        borderColor: isDark ? 'rgba(251,146,60,0.8)' : 'rgba(239,68,68,0.8)',
      },
      iconButton: {
        backgroundColor: isDark ? 'rgba(30,41,59,0.55)' : 'rgba(148,163,184,0.12)',
        borderColor: isDark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.2)',
      },
      iconButtonPressed: {
        backgroundColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(148,163,184,0.2)',
      },
    }),
    [isDark]
  );

  React.useEffect(() => {
    const match = navItems.find((item) => item.route === activeKey);
    const key = match?.key ?? match?.label ?? activeKey;
    const layout = key ? pillLayouts.current[key] : undefined;

    if (layout) {
      indicatorOpacity.setValue(1);
      Animated.parallel([
        Animated.spring(indicatorX, {
          toValue: layout.x + 6,
          useNativeDriver: true,
          tension: 120,
          friction: 16,
        }),
        Animated.spring(indicatorW, {
          toValue: layout.width - 12,
          useNativeDriver: false,
          tension: 120,
          friction: 16,
        }),
      ]).start();

      scrollRef.current?.scrollTo({
        x: Math.max(layout.x - 48, 0),
        animated: true,
      });
    }

    activeGlow.setValue(0);
    Animated.timing(activeGlow, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [activeKey, activeGlow, indicatorOpacity, indicatorW, indicatorX, navItems]);

  const handleItemPress = React.useCallback(
    (item: NavbarItem) => {
      if (item.onPress) {
        item.onPress();
        return;
      }

      if (item.route) {
        go(item.route);
      }
    },
    [go]
  );

  const headerVisible = Boolean(title || subtitle);

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
          <View style={tw`flex-row items-center gap-2 ml-3`}>
            <Pressable
              onPress={onPressSearch}
              style={({ pressed }) => [
                styles.iconButton,
                themeStyles.iconButton,
                !onPressSearch && styles.iconButtonDisabled,
                pressed && [styles.iconButtonPressed, themeStyles.iconButtonPressed],
              ]}
              disabled={!onPressSearch}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <MaterialIcons
                name="search"
                size={18}
                color={
                  isDark
                    ? tw.color('text-gray-300') || '#cbd5f5'
                    : tw.color('text-gray-600') || '#475569'
                }
              />
            </Pressable>
            <Pressable
              onPress={onPressFilter}
              style={({ pressed }) => [
                styles.iconButton,
                themeStyles.iconButton,
                !onPressFilter && styles.iconButtonDisabled,
                pressed && [styles.iconButtonPressed, themeStyles.iconButtonPressed],
              ]}
              disabled={!onPressFilter}
              accessibilityRole="button"
              accessibilityLabel="Filter"
            >
              <MaterialIcons
                name="tune"
                size={18}
                color={
                  isDark
                    ? tw.color('text-gray-300') || '#cbd5f5'
                    : tw.color('text-gray-600') || '#475569'
                }
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
                styles.indicator,
                themeStyles.indicator,
                {
                  opacity: indicatorOpacity,
                  transform: [{ translateX: indicatorX }],
                  width: indicatorW,
                },
              ]}
            />
            {navItems.map((item) => {
              const key = item.key ?? item.label;
              const isActive = item.route === activeKey;
              return (
                <Pressable
                  key={key}
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
                  accessibilityRole="button"
                  accessibilityLabel={item.accessibilityLabel ?? item.label}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.activeGlow,
                      themeStyles.activeGlow,
                      {
                        opacity: isActive ? activeGlow : 0,
                      },
                    ]}
                  />
                  <View style={tw`flex-row items-center gap-1.5 px-3 ${BAR.pill}`}>
                    {item.icon && (
                      <MaterialIcons
                        name={item.icon}
                        size={15}
                        color={
                          isActive
                            ? tw.color('text-white') || '#fff'
                            : isDark
                              ? tw.color('text-gray-300') || '#cbd5f5'
                              : tw.color('text-gray-500') || '#64748b'
                        }
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
  container: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  pill: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  pillActive: {
    backgroundColor: '#111827',
    borderColor: 'rgba(15,23,42,0.8)',
  },
  pillPressed: {
    transform: [{ scale: 0.98 }],
  },
  indicator: {
    position: 'absolute',
    height: 2,
    bottom: -2,
    borderRadius: 999,
    backgroundColor: 'rgba(14,165,233,0.9)',
  },
  activeGlow: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: -8,
    right: -8,
    backgroundColor: 'rgba(14,165,233,0.18)',
    borderRadius: 999,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    borderWidth: 1,
    marginLeft: 4,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  iconButtonPressed: {
    backgroundColor: 'rgba(148,163,184,0.2)',
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
});

export default React.memo(NavbarNative);
