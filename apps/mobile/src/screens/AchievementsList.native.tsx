// apps/mobile/src/screens/AchievementsList.native.tsx
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Platform,
} from 'react-native';
import { useShopContext } from '@mytutorapp/shared/context';
import { useAchievements } from '@mytutorapp/shared/hooks/useAchievements';
import tw from '../../tailwind';

type Props = { studentId?: number; title?: string };

type Achievement = {
  id: string | number;
  title: string;
  earned_at: string | number | Date;
  icon_url?: string | null;
  course_id?: string | number | null;
};

const CARD_BORDER = 'border border-gray-300 dark:border-gray-700';
const CARD_BG = 'bg-white dark:bg-gray-800';

const AchievementsList: React.FC<Props> = ({ studentId, title = 'Achievements' }) => {
  const { backendUrl, token } = useShopContext();
  const { achievements, loading, error, refetch } = useAchievements({
    backendUrl,
    token,
    studentId,
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const data = useMemo<Achievement[]>(
    () => (Array.isArray(achievements) ? achievements : []),
    [achievements]
  );

  const formatWhen = (d: Achievement['earned_at']) =>
    new Date(d).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const renderSkeletonCard = (key: string | number) => (
    <View
      key={key}
      style={tw`${CARD_BG} ${CARD_BORDER} rounded-xl p-4 w-full`}
      accessible
      accessibilityLabel="Loading achievement"
    >
      <View style={tw`flex-row items-center`}>
        <View style={tw`w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 mr-3`} />
        <View style={tw`flex-1`}>
          <View style={tw`h-4 w-40 rounded bg-gray-200 dark:bg-gray-700`} />
          <View style={tw`mt-2 h-3 w-28 rounded bg-gray-200 dark:bg-gray-700`} />
        </View>
      </View>
      <View style={tw`mt-3 h-3 w-24 rounded bg-gray-200 dark:bg-gray-700`} />
    </View>
  );

  const renderItem = ({ item }: ListRenderItemInfo<Achievement>) => (
    <View style={tw`w-1/2 px-2 pb-4`}>
      <View
        style={tw`${CARD_BG} ${CARD_BORDER} rounded-xl p-4 h-full`}
        accessible
        accessibilityLabel={item.title}
      >
        <View style={tw`flex-row items-center`}>
          {item.icon_url ? (
            <Image
              source={{ uri: item.icon_url }}
              style={tw`w-10 h-10 rounded mr-3`}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={tw`w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 mr-3`} />
          )}
          <View style={tw`flex-1`}>
            <Text numberOfLines={1} style={tw`font-semibold text-gray-900 dark:text-gray-100`}>
              {item.title}
            </Text>
            <Text style={tw`text-xs text-blue-700 dark:text-blue-300`}>
              {formatWhen(item.earned_at)}
            </Text>
          </View>
        </View>

        {!!item.course_id && (
          <Text style={tw`text-xs text-blue-700 dark:text-blue-300 mt-2`}>
            Course: <Text style={tw`font-medium`}>{String(item.course_id)}</Text>
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={tw`w-full`}>
      <View style={tw`flex-row items-center justify-between mb-3`}>
        <Text style={tw`text-xl font-bold text-gray-100`}>{title}</Text>
        {!loading && (
          <TouchableOpacity
            onPress={refetch}
            accessibilityRole="button"
            accessibilityLabel="Refresh achievements"
            style={tw`rounded-lg h-9 px-3 items-center justify-center ${CARD_BG} ${CARD_BORDER}`}
          >
            <Text style={tw`text-sm font-semibold text-gray-100`}>Refresh</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Error */}
      {!!error && !loading && (
        <View
          accessibilityRole="alert"
          style={tw`rounded-xl p-4 border border-red-400 bg-red-50/10`}
        >
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-sm text-red-300 flex-1 pr-3`} numberOfLines={3}>
              {String(error)}
            </Text>
            <TouchableOpacity
              onPress={refetch}
              style={tw`rounded-lg h-8 px-3 bg-red-600 items-center justify-center`}
            >
              <Text style={tw`text-white text-xs font-semibold`}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={tw`flex-row flex-wrap -mx-2`}>
          <View style={tw`w-1/2 px-2 pb-4`}>{renderSkeletonCard('s1')}</View>
          <View style={tw`w-1/2 px-2 pb-4`}>{renderSkeletonCard('s2')}</View>
          <View style={tw`w-1/2 px-2 pb-4`}>{renderSkeletonCard('s3')}</View>
        </View>
      )}

      {/* Empty */}
      {!loading && !error && data.length === 0 && (
        <View style={tw`${CARD_BG} ${CARD_BORDER} rounded-xl p-6`}>
          <Text style={tw`text-sm text-gray-200`}>No achievements yet.</Text>
          <Text style={tw`text-xs text-gray-400 mt-1`}>
            Start a course or complete a week to earn your first badge.
          </Text>
        </View>
      )}

      {/* List */}
      {!loading && !error && data.length > 0 && (
        <FlatList
          data={data}
          keyExtractor={(a) => String(a.id)}
          renderItem={renderItem}
          numColumns={2}
          contentContainerStyle={tw`-mx-2`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Platform.OS === 'ios' ? undefined : '#fff'}
            />
          }
          ListFooterComponent={<View style={tw`h-2`} />}
        />
      )}
    </View>
  );
};

export default AchievementsList;
