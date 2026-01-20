import React, { useMemo } from 'react';
import { View, Text, SectionList, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Image } from 'expo-image';
import { useMyLibrary } from '@mytutorapp/shared/hooks';
import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

type Nav = StackNavigationProp<MainStackParamList, 'Courses'>;

type SectionItem =
  | ({ kind: 'classvault' } & RecordedVideo)
  | ({ kind: 'course'; ai?: boolean } & Course);

type LibrarySection = {
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

const Card: React.FC<{
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  badge?: string;
  onPress: () => void;
}> = ({ title, subtitle, imageUrl, badge, onPress }) => (
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

const MyCoursesNative: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { role, isTutor, sections } = useMyLibrary();

  const librarySections: LibrarySection[] = useMemo(() => {
    if (role === 'tutor') {
      return [
        {
          key: 'createdClassVault',
          title: 'Your ClassVault Videos & Notes',
          subtitle: 'Only your uploaded ClassVault content.',
          data: sections.createdClassVault.items.map((item) => ({
            ...item,
            kind: 'classvault',
          })),
          loading: sections.createdClassVault.loading,
          error: sections.createdClassVault.error,
          emptyMessage: 'You haven’t uploaded any ClassVault videos or notes yet.',
          hasMore: sections.createdClassVault.hasMore,
          loadMore: sections.createdClassVault.loadMore,
        },
        {
          key: 'normalCourses',
          title: 'Your Courses',
          subtitle: 'Courses you created for learners.',
          data: sections.normalCourses.items.map((item) => ({
            ...item,
            kind: 'course',
          })),
          loading: sections.normalCourses.loading,
          error: sections.normalCourses.error,
          emptyMessage: 'You haven’t created any courses yet.',
          hasMore: sections.normalCourses.hasMore,
          loadMore: sections.normalCourses.loadMore,
        },
        {
          key: 'aiCourses',
          title: 'Your AI Courses',
          subtitle: 'AI courses you personally unlocked.',
          data: sections.aiCourses.items.map((item) => ({
            ...item,
            kind: 'course',
            ai: true,
          })),
          loading: sections.aiCourses.loading,
          error: sections.aiCourses.error,
          emptyMessage: 'You haven’t unlocked any AI courses yet.',
          hasMore: sections.aiCourses.hasMore,
          loadMore: sections.aiCourses.loadMore,
        },
      ];
    }

    return [
      {
        key: 'purchasedClassVault',
        title: 'Purchased Videos & Notes',
        subtitle: 'Your ClassVault purchases live here.',
        data: sections.purchasedClassVault.items.map((item) => ({
          ...item,
          kind: 'classvault',
        })),
        loading: sections.purchasedClassVault.loading,
        error: sections.purchasedClassVault.error,
        emptyMessage: 'You haven’t purchased any videos or notes yet.',
        hasMore: sections.purchasedClassVault.hasMore,
        loadMore: sections.purchasedClassVault.loadMore,
      },
      {
        key: 'aiCourses',
        title: 'AI Courses',
        subtitle: 'AI-powered courses you unlocked.',
        data: sections.aiCourses.items.map((item) => ({
          ...item,
          kind: 'course',
          ai: true,
        })),
        loading: sections.aiCourses.loading,
        error: sections.aiCourses.error,
        emptyMessage: 'You haven’t unlocked any AI courses yet.',
        hasMore: sections.aiCourses.hasMore,
        loadMore: sections.aiCourses.loadMore,
      },
      {
        key: 'normalCourses',
        title: 'Courses',
        subtitle: 'Courses you enrolled in or purchased.',
        data: sections.normalCourses.items.map((item) => ({
          ...item,
          kind: 'course',
        })),
        loading: sections.normalCourses.loading,
        error: sections.normalCourses.error,
        emptyMessage: 'You haven’t enrolled in any courses yet.',
        hasMore: sections.normalCourses.hasMore,
        loadMore: sections.normalCourses.loadMore,
      },
    ];
  }, [role, sections]);

  const renderItem = ({ item }: { item: SectionItem }) => {
    if (item.kind === 'classvault') {
      return (
        <Card
          title={item.title}
          subtitle={item.subject || item.grade_level || 'ClassVault'}
          imageUrl={item.thumbnail_url}
          badge={role === 'student' ? 'Purchased' : undefined}
          onPress={() => navigation.navigate('ClassVaultDetail', { id: Number(item.id) })}
        />
      );
    }

    if (item.ai) {
      return (
        <Card
          title={item.title}
          subtitle={item.subject || 'AI Course'}
          imageUrl={item.thumbnail_url}
          badge="AI"
          onPress={() =>
            navigation.navigate('RobotTutor', {
              courseId: String(item.id),
              courseTitle: item.title,
              source: 'library',
            })
          }
        />
      );
    }

    return (
      <Card
        title={item.title}
        subtitle={item.subject || 'Course'}
        imageUrl={item.thumbnail_url}
        onPress={() =>
          navigation.navigate('CourseProgress', {
            courseId: String(item.id),
          })
        }
      />
    );
  };

  return (
    <SectionList
      sections={librarySections}
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
          <Text style={tw`text-2xl font-bold text-slate-900 dark:text-white`}>My Library</Text>
          <Text style={tw`text-sm text-slate-500 dark:text-white/60 mt-1`}>
            {isTutor
              ? 'Everything you created or unlocked lives here.'
              : 'Your purchased and enrolled learning content lives here.'}
          </Text>
        </View>
      }
      contentContainerStyle={tw`pb-10 bg-slate-50 dark:bg-[#0b1016]`}
      stickySectionHeadersEnabled={false}
    />
  );
};

export default MyCoursesNative;
