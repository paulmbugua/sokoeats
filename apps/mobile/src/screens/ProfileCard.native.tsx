// apps/mobile/src/components/ProfileCard.native.tsx
import React, { useMemo, useRef } from 'react';
import { View, Text, Image, Pressable, Animated } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 } from '@expo/vector-icons';

import { useShopContext } from '@mytutorapp/shared/context';
import type { Profile } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

const fallbackImg = require('../../assets/fallback.png');

type Props = { profile: Profile };

const statusClass = (s?: string) => {
  switch (s) {
    case 'Online':
      return 'bg-green-500';
    case 'Busy':
      return 'bg-yellow-500';
    case 'New':
      return 'bg-blue-500';
    case 'Free':
      return 'bg-purple-500';
    default:
      return 'bg-pink-400';
  }
};

export default function ProfileCard({ profile }: Props) {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { backendUrl } = useShopContext();

  // derive rating + totalReviews safely from Profile
  const rawRating = (profile as any)?.rating ?? 0;
  const totalReviews = (profile as any)?.totalReviews ?? 0;
  const rating = Math.round(Number(rawRating) * 2) / 2;

  // certified flag directly from Profile
  const showCertBadge = profile.role === 'tutor' && (profile as any)?.certified === true;

  // Resolve first image
  const firstImage =
    Array.isArray(profile.gallery) && profile.gallery.length ? profile.gallery[0] : null;

  const resolvedSource = useMemo(() => {
    if (typeof firstImage === 'string') {
      const uri = firstImage.startsWith('/') ? `${backendUrl}${firstImage}` : firstImage;
      return { uri };
    }
    return fallbackImg;
  }, [firstImage, backendUrl]);

  // Stars (full/half)
  const stars = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const idx = i + 1;
      const full = rating >= idx;
      const half = rating + 0.5 === idx;
      return { full, half };
    });
  }, [rating]);

  // Press scale animation
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();

  const onPress = () => {
    navigation.navigate('Profile', { id: String(profile.id) });
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animateTo(0.98)}
      onPressOut={() => animateTo(1)}
      style={tw`w-full`}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
    >
      <Animated.View
        style={[tw`rounded-2xl overflow-hidden bg-gray-100 shadow-lg`, { transform: [{ scale }] }]}
      >
        {/* Image */}
        <Image source={resolvedSource} resizeMode="cover" style={tw`w-full h-48`} />

        {/* Certificate badge */}
        {showCertBadge && (
          <View
            style={tw`absolute top-2 left-2 w-8 h-8 rounded-full items-center justify-center bg-black/25`}
          >
            <FontAwesome5 name="certificate" size={24} color="#f59e0b" />
            <View style={tw`absolute inset-0 items-center justify-center`}>
              <FontAwesome5 name="check" size={10} color="#ffffff" />
            </View>
          </View>
        )}

        {/* Bottom overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.8)', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={tw`absolute bottom-0 left-0 right-0 px-3 py-2`}
        >
          {/* Name + Status */}
          <View style={tw`w-full flex-row items-center justify-between`}>
            <Text numberOfLines={1} style={tw`text-white font-semibold`}>
              {profile.name || 'Unnamed'}
            </Text>
            {!!profile.status && (
              <View style={tw`${statusClass(profile.status)} px-2 py-1 rounded-full`}>
                <Text style={tw`text-white text-[10px]`}>{profile.status}</Text>
              </View>
            )}
          </View>

          {/* Category */}
          {profile.role === 'tutor' && !!profile.category && (
            <View style={tw`mt-1`}>
              <Text numberOfLines={1} style={tw`text-white/80 text-xs`}>
                {profile.category}
              </Text>
            </View>
          )}

          {/* Stars + review count */}
          {profile.role === 'tutor' && (
            <View style={tw`mt-1 flex-row items-center`}>
              {stars.map(({ full, half }, i) => (
                <FontAwesome5
                  key={i}
                  name={half ? 'star-half-alt' : 'star'}
                  size={12}
                  color="#eab308"
                  solid={full || half}
                  style={tw`${full || half ? 'opacity-100' : 'opacity-40'} mr-1`}
                />
              ))}
              <Text style={tw`text-white/90 text-xs ml-2`}>
                ({totalReviews} review{totalReviews !== 1 ? 's' : ''})
              </Text>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
