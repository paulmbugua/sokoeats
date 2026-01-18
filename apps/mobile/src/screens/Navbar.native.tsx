// apps/mobile/src/screens/Navbar.native.tsx
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { FontAwesome } from '@expo/vector-icons';
import tw from '../../tailwind';
import type { MainStackParamList } from '../navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  extractScopeHint,
  normalizeCountryLabel,
  parseSmartSearchIntent,
  resolveSearchTarget,
} from '@mytutorapp/shared/utils/smartSearchIntent';

type NavProp = StackNavigationProp<MainStackParamList>;
type Props = {};

const BAR = { rowH: 'h-9', pill: 'h-9' };

const NavbarNative: React.FC<Props> = () => {
  const navigation = useNavigation<NavProp>();
  const { orgToken } = useShopContext(); // <-- now available
  const [q, setQ] = React.useState('');

  const go = (name: keyof MainStackParamList) => navigation.navigate(name as never);

  const submitSearch = (raw?: string) => {
    const query = String(raw ?? q ?? '').trim();
    if (!query) return;

    const intent = parseSmartSearchIntent(query);
    const target = resolveSearchTarget(query, 'auto');
    const country = intent.country ?? normalizeCountryLabel(query);

    if (target === 'tutors') {
      navigation.navigate('FindTutor', {
        q: query,
        subject: intent.subject,
        country: country?.code,
        minRating: intent.minRating,
      } as any);
      return;
    }

    const scope = extractScopeHint(query);
    navigation.navigate('Courses', {
      tab: target === 'library' ? 'library' : 'courses',
      q: query,
      subject: intent.subject,
      gradeBand: intent.gradeBand,
      level: intent.level,
      country: country?.name,
      minRating: intent.minRating,
      maxPrice: intent.maxPrice,
      scope,
    } as any);
  };

  // Build pills AFTER reading orgToken
  const PILL_ITEMS = React.useMemo(
    () =>
      [
        { label: 'Find Tutor', route: 'FindTutor' },
        { label: 'My Courses', route: 'Courses' },
        { label: 'Resources', route: 'Resources' },
        { label: 'Messages', route: 'Messages' },
        {
          label: 'For Institutions',
          route: (orgToken ? 'OrgProfile' : 'InstitutionLogin') as keyof MainStackParamList,
        },
      ] as const,
    [orgToken]
  );

  return (
    <View
      style={tw`bg-white/75 dark:bg-[#0b121a]/75 border-b border-gray-200 dark:border-darkCard pt-2 pb-2`}
    >
      <View style={tw`${BAR.rowH} px-3 flex-row items-center mt-0.5`}>
        <View
          style={tw`flex-1 flex-row items-center rounded-xl px-3 ${BAR.pill} bg-gray-100 dark:bg-[#172534] border border-gray-200/70`}
        >
          <FontAwesome
            name="search"
            size={14}
            color={tw.color('text-text-white/60') || '#94a3b8'}
          />
          <TextInput
            placeholder="Search tutors, courses…"
            placeholderTextColor={tw.color('text-text-white/60') || '#94a3b8'}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => submitSearch(q)}
            style={tw`ml-3 mr-0.5 pr-3 py-1 flex-1 text-[13px] leading-[16px] text-gray-400 dark:text-gray-300 opacity-60`}
            selectionColor={tw.color('text-text-white/60') || '#94a3b8'}
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tw`px-2 mt-1 gap-1.5 pb-1`}
      >
        {PILL_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            onPress={() => go(item.route)}
            style={tw`px-2.5 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-white/5`}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={tw`text-xs text-gray-800 dark:text-gray-100`}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default NavbarNative;
