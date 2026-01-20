import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, SectionList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Image } from 'expo-image';
import { useResourcesExplore } from '@mytutorapp/shared/hooks';
import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import type { OerBookItem, OerVideoItem } from '@mytutorapp/shared/api/resourcesApi';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

type Nav = StackNavigationProp<MainStackParamList, 'Resources'>;

type SectionItem =
  | ({ kind: 'classvault' } & RecordedVideo)
  | ({ kind: 'course' } & Course)
  | ({ kind: 'oerVideo' } & OerVideoItem)
  | ({ kind: 'oerBook' } & OerBookItem);

type ExploreSection = {
  key: string;
  title: string;
  subtitle: string;
  data: SectionItem[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  hasMore: boolean;
  loadMore: () => void;
};

const TabBar: React.FC<{
  value: 'videos' | 'courses';
  onChange: (next: 'videos' | 'courses') => void;
}> = ({ value, onChange }) => (
  <View style={tw`flex-row bg-white dark:bg-[#0f1821] rounded-full border border-slate-200 dark:border-white/10 p-1`}>    
    {([
      { key: 'videos', label: 'Explore Videos & Notes' },
      { key: 'courses', label: 'Explore Courses' },
    ] as const).map((tab) => (
      <Pressable
        key={tab.key}
        onPress={() => onChange(tab.key)}
        style={tw`flex-1 px-3 py-2 rounded-full ${
          value === tab.key ? 'bg-blue-500' : 'bg-transparent'
        }`}
      >
        <Text
          style={tw`text-xs text-center font-semibold ${
            value === tab.key ? 'text-white' : 'text-slate-500 dark:text-white/70'
          }`}
        >
          {tab.label}
        </Text>
      </Pressable>
    ))}
  </View>
);

const Card: React.FC<{
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  onPress: () => void;
  badge?: string;
}> = ({ title, subtitle, imageUrl, onPress, badge }) => (
  <Pressable onPress={onPress} style={tw`mb-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111b25] overflow-hidden`}>
    <View style={tw`h-32 bg-slate-200 dark:bg-white/10`}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={tw`w-full h-full`} contentFit="cover" />
      ) : null}
    </View>
    <View style={tw`p-3`}>
      <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
        {title}
      </Text>
      <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`} numberOfLines={1}>
        {subtitle}
      </Text>
      {badge ? (
        <View style={tw`mt-2 self-start rounded-full bg-blue-50 px-2 py-0.5`}>
          <Text style={tw`text-[11px] text-blue-600 font-semibold`}>{badge}</Text>
        </View>
      ) : null}
    </View>
  </Pressable>
);

const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <View style={tw`px-4 pt-4 pb-2`}>
    <Text style={tw`text-lg font-semibold text-slate-900 dark:text-white`}>{title}</Text>
    <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>{subtitle}</Text>
  </View>
);

const SectionFooter: React.FC<{
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage: string;
  hasMore: boolean;
  onLoadMore: () => void;
}> = ({ loading, error, empty, emptyMessage, hasMore, onLoadMore }) => (
  <View style={tw`px-4 pb-4`}>
    {loading && !error && empty ? (
      <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>Loading…</Text>
    ) : null}
    {error ? <Text style={tw`text-sm text-red-500`}>{error}</Text> : null}
    {!loading && !error && empty ? (
      <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>{emptyMessage}</Text>
    ) : null}
    {hasMore ? (
      <Pressable
        onPress={onLoadMore}
        style={tw`mt-3 self-start rounded-full bg-blue-500 px-4 py-2`}
      >
        <Text style={tw`text-sm font-semibold text-white`}>Load more</Text>
      </Pressable>
    ) : null}
  </View>
);

const ResourcesPage: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParamList, 'Resources'>>();
  const initialTab = route.params?.tab === 'courses' ? 'courses' : 'videos';
  const initialQuery = route.params?.q ?? '';
  const [tab, setTab] = useState<'videos' | 'courses'>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const explore = useResourcesExplore(debouncedQuery, tab);

  const sections: ExploreSection[] = useMemo(() => {
    if (tab === 'videos') {
      return [
        {
          key: 'classvault',
          title: 'ClassVault marketplace',
          subtitle: 'Discover videos and notes from tutors.',
          data: explore.classVault.items.map((item) => ({
            ...item,
            kind: 'classvault',
          })),
          loading: explore.classVault.loading,
          error: explore.classVault.error,
          emptyMessage: 'No ClassVault results yet.',
          hasMore: explore.classVault.hasMore,
          loadMore: explore.classVault.loadMore,
        },
        {
          key: 'oerVideos',
          title: 'Free OER videos',
          subtitle: 'Open resources from public providers.',
          data: explore.oerVideos.items.map((item) => ({
            ...item,
            kind: 'oerVideo',
          })),
          loading: explore.oerVideos.loading,
          error: explore.oerVideos.error,
          emptyMessage: 'No OER videos match that search.',
          hasMore: explore.oerVideos.hasMore,
          loadMore: explore.oerVideos.loadMore,
        },
      ];
    }

    return [
      {
        key: 'courses',
        title: 'Courses',
        subtitle: 'Explore tutor-led courses available to enroll.',
        data: explore.normalCourses.items.map((item) => ({
          ...item,
          kind: 'course',
        })),
        loading: explore.normalCourses.loading,
        error: explore.normalCourses.error,
        emptyMessage: 'No courses found yet.',
        hasMore: explore.normalCourses.hasMore,
        loadMore: explore.normalCourses.loadMore,
      },
      {
        key: 'oerBooks',
        title: 'Free OER books',
        subtitle: 'OpenStax and other openly licensed books.',
        data: explore.oerBooks.items.map((item) => ({
          ...item,
          kind: 'oerBook',
        })),
        loading: explore.oerBooks.loading,
        error: explore.oerBooks.error,
        emptyMessage: 'No OER books match that search.',
        hasMore: explore.oerBooks.hasMore,
        loadMore: explore.oerBooks.loadMore,
      },
    ];
  }, [tab, explore]);

  const renderItem = ({ item }: { item: SectionItem }) => {
    if (item.kind === 'classvault') {
      return (
        <Card
          title={item.title}
          subtitle={item.subject || item.grade_level || 'ClassVault'}
          imageUrl={item.thumbnail_url}
          onPress={() => navigation.navigate('ClassVaultDetail', { id: Number(item.id) })}
        />
      );
    }

    if (item.kind === 'oerVideo') {
      const id = item.slug || item.title;
      return (
        <Card
          title={item.title}
          subtitle={item.provider || item.subject || 'OER Video'}
          imageUrl={item.thumbnail_url}
          onPress={() => navigation.navigate('VideoCollection', { id })}
        />
      );
    }

    if (item.kind === 'oerBook') {
      const id = item.slug || item.id;
      return (
        <Card
          title={item.title}
          subtitle="OpenStax book"
          imageUrl={item.cover_url}
          onPress={() => navigation.navigate('OerReaderFull', { id })}
        />
      );
    }

    return (
      <Card
        title={item.title}
        subtitle={item.subject || 'Course'}
        imageUrl={item.thumbnail_url}
        onPress={() => navigation.navigate('CourseDetails', { courseId: String(item.id) })}
      />
    );
  };

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) => `${item.kind}-${item.id}-${index}`}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => (
        <SectionHeader title={section.title} subtitle={section.subtitle} />
      )}
      renderSectionFooter={({ section }) => (
        <SectionFooter
          loading={section.loading}
          error={section.error}
          empty={section.data.length === 0}
          emptyMessage={section.emptyMessage}
          hasMore={section.hasMore}
          onLoadMore={section.loadMore}
        />
      )}
      ListHeaderComponent={
        <View style={tw`px-4 pt-6 pb-2`}>
          <Text style={tw`text-2xl font-bold text-slate-900 dark:text-white`}>Explore</Text>
          <Text style={tw`text-sm text-slate-500 dark:text-white/60 mt-1`}>
            Discover videos, notes, courses, and free resources.
          </Text>
          <View style={tw`mt-4`}>
            <View style={tw`h-12 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#172534] flex-row items-center px-3`}>
              <Text style={tw`text-slate-500 dark:text-white/70 text-base mr-2`}>🔍</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search resources"
                placeholderTextColor="#7a8aa0"
                style={tw`flex-1 h-full text-slate-900 dark:text-slate-100`}
              />
            </View>
          </View>
          <View style={tw`mt-4`}>
            <TabBar value={tab} onChange={setTab} />
          </View>
        </View>
      }
      contentContainerStyle={tw`pb-10 bg-slate-50 dark:bg-[#0b1016]`}
      stickySectionHeadersEnabled={false}
    />
  );
};

export default ResourcesPage;
