/// <reference path="../declarations.d.ts" />

import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ImageBackground,
  Pressable,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import tw from '../../tailwind';
import type { MainStackParamList } from '../navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';

import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeInUp,
  interpolate,
  LinearTransition, // ← move here
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/* -------------------------------------------------------------------------- */
/* Env + Branding                                                             */
/* -------------------------------------------------------------------------- */

const BRAND = 'DayBreak';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? '';
const LANDING_BG = process.env.EXPO_PUBLIC_LANDING_BG ?? '';
const HERO_BG = process.env.EXPO_PUBLIC_HERO_BG ?? '';
const FALLBACK_HERO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBozRV2GKWrHHA1XVoLXsGuDAkV7acHbeNLK2ea8_oo-Iop1uhSvLfF9qnwoM_T9J3VZxFYKcpMbjdpRZxDb789fcNsPV-spTZNKrl_-n1-4ira4uzLqd9oIdgp9QMzh6rRCOtK0872iIQSaETSEPiPLJONFh5mIosOcBdtgxTItSv8SHx-_ck2_SE2O1sn_rj2540TndCHxN_Taha43GCODhjOlapmrR8UEeQmNgvwgwM6FWqJXBhDl_zcMQCRcWciCH3xlz8j_cc';

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

type Nav = NavigationProp<MainStackParamList>;

const Landing: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { height } = Dimensions.get('window');
  const { orgToken } = useShopContext();

  const overlayStyle = useMemo(
    () => ({
      backgroundColor: isDark ? 'rgba(15,23,42,0.40)' : 'rgba(255,255,255,0.70)',
      ...tw.style('absolute inset-0'),
    }),
    [isDark]
  );

  /* background subtle parallax (scrollY drives gradients) */
  const scrollY = useSharedValue(0);
  const onScroll = useCallback(
    (e: any) => {
      scrollY.value = e.nativeEvent.contentOffset?.y ?? 0;
    },
    [scrollY]
  );

  const glowAStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [0, 200], [1, 0.7], Extrapolation.CLAMP);
    return { opacity: t };
  });
  const glowBStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [0, 200], [1, 0.6], Extrapolation.CLAMP);
    return { opacity: t };
  });

  // replace your current `go` with this:
  const go = React.useCallback(
    <T extends keyof MainStackParamList>(screen: T, params?: MainStackParamList[T]) => {
      // Call the 1-arg or 2-arg overload correctly.
      if (params === undefined) {
        (navigation as any).navigate(screen as any);
      } else {
        (navigation as any).navigate(screen as any, params as any);
      }
    },
    [navigation]
  );

  return (
    <View style={tw.style('flex-1', isDark ? 'bg-slate-900' : 'bg-white')}>
      {/* BG image layer */}
      {LANDING_BG ? (
        <View style={tw`absolute inset-0`}>
          <ImageBackground source={{ uri: LANDING_BG }} resizeMode="cover" style={tw`flex-1`} />
          <View style={overlayStyle as any} />
        </View>
      ) : null}

      {/* Decorative blobs (with tiny parallax) */}
      <View pointerEvents="none" style={tw`absolute inset-0`}>
        <Animated.View
          style={[
            tw.style('absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-300/30'),
            glowAStyle,
          ]}
        />
        <Animated.View
          style={[
            tw.style('absolute top-10 right-10 h-80 w-80 rounded-full bg-cyan-300/30'),
            glowBStyle,
          ]}
        />
        <View
          style={tw.style(
            'absolute -bottom-24 left-1/2 -ml-48 h-96 w-96 rounded-full bg-violet-200/20'
          )}
        />
      </View>

      <ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={tw`pb-6`}>
        {/* Hero */}
        <View style={tw`px-4 pt-6`}>
          <Hero
            onFindTutor={() => go('FindTutor')}
            onMyCourses={() => go('Courses')}
            onOrg={() => (orgToken ? go('OrgProfile') : go('InstitutionLogin'))}
            onRobot={() => go('RobotTutor')}
            viewportH={height}
          />
        </View>

        {/* (Optional) more content could go here… */}
      </ScrollView>
    </View>
  );
};

/* --------------------------------- Hero ---------------------------------- */

const Hero: React.FC<{
  onFindTutor: () => void;
  onMyCourses: () => void;
  onOrg: () => void;
  onRobot: () => void;
  viewportH: number;
}> = ({ onFindTutor, onMyCourses, onOrg, onRobot, viewportH }) => {
  const bgUri = HERO_BG || LANDING_BG || FALLBACK_HERO;
  const minH = Math.max(420, Math.floor(viewportH * 0.6));

  /* zoom-in on mount */
  const zoom = useSharedValue(1.04);
  useEffect(() => {
    zoom.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
  }, [zoom]);

  const bgStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));

  return (
    <View style={tw`overflow-hidden rounded-2xl`}>
      <Animated.View entering={FadeIn.duration(600)} style={bgStyle}>
        <ImageBackground
          source={{ uri: bgUri }}
          resizeMode="cover"
          style={[tw`w-full items-center justify-center`, { minHeight: minH }]}
          imageStyle={{ width: '100%', height: undefined }}
        >
          {/* gradient veils */}
          <LinearGradient
            colors={['rgba(2,6,23,0.15)', 'rgba(2,6,23,0.35)']}
            style={tw`absolute inset-0`}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.12)', 'transparent']}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.6, y: 0.4 }}
            style={tw`absolute inset-0`}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.08)', 'transparent']}
            start={{ x: 0.9, y: 0.9 }}
            end={{ x: 0.4, y: 0.6 }}
            style={tw`absolute inset-0`}
          />

          <HeroContent
            onFindTutor={onFindTutor}
            onMyCourses={onMyCourses}
            onOrg={onOrg}
            onRobot={onRobot}
          />
        </ImageBackground>
      </Animated.View>
    </View>
  );
};

const HeroContent: React.FC<{
  onFindTutor: () => void;
  onMyCourses: () => void;
  onOrg: () => void;
  onRobot: () => void;
}> = ({ onFindTutor, onMyCourses, onOrg, onRobot }) => {
  /* stagger controller (0 -> 1) */
  const t = useSharedValue(0);
  useEffect(() => {
    // staged ramp for staggered children
    t.value = withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) });
  }, [t]);

  const badgeS = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.3], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [0, 0.3], [16, 0], Extrapolation.CLAMP) }],
  }));
  const h1S = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.55], [0, 1]),
    transform: [{ translateY: interpolate(t.value, [0, 0.55], [20, 0]) }],
  }));
  const pS = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.75], [0, 1]),
    transform: [{ translateY: interpolate(t.value, [0, 0.75], [20, 0]) }],
  }));

  return (
    <View style={tw`px-4 py-10 items-center`}>
      <Animated.View layout={LinearTransition.duration(250)}>
        <Animated.View style={badgeS} entering={FadeInDown.duration(500)}>
          <View style={tw`px-3 py-1 rounded-full bg-white/10 items-center justify-center`}>
            <Text style={tw`text-white text-xs font-semibold`}>Learn anything, anytime</Text>
          </View>
        </Animated.View>
      </Animated.View>

      <Animated.View layout={LinearTransition.duration(250)}>
        <Animated.View style={h1S} entering={FadeInDown.delay(80).duration(550)}>
          <Text style={tw`text-white text-4xl font-black text-center mt-4`}>
            Learn anything with AI + expert tutors
          </Text>
        </Animated.View>
      </Animated.View>

      <Animated.View layout={LinearTransition.duration(250)}>
        <Animated.View style={pS} entering={FadeInDown.delay(140).duration(550)}>
          <Text style={tw`text-white/90 text-sm text-center mt-3 max-w-[760px]`}>
            Connect with expert tutors and our AI Robot Teacher. Master new skills or ace your
            coursework—your pace, your schedule.
          </Text>
        </Animated.View>
      </Animated.View>
      {/* 2×2 CTAs – animated in a gentle cascade */}
      <View style={tw`mt-6 w-full items-center`}>
        <View style={tw`w-full max-w-[420px]`}>
          {/* 2×2 grid with tighter cards & bigger gaps */}
          <View style={tw`flex-row flex-wrap justify-center gap-3`}>
            <AnimatedCTA
              label="Find Tutor"
              onPress={onFindTutor}
              delay={120}
              bgClass="bg-white"
              textClass="text-slate-900"
            />
            <AnimatedCTA
              label="My Courses"
              onPress={onMyCourses}
              delay={180}
              bgClass="bg-white/90"
              textClass="text-slate-900"
            />
            <AnimatedCTA
              label="For Institutions"
              onPress={onOrg}
              delay={240}
              bgClass="bg-emerald-600"
              textClass="text-white"
            />
            <AnimatedCTA
              label="🤖 Learn with A.I."
              onPress={onRobot}
              delay={300}
              bgClass="bg-black/70"
              textClass="text-white"
            />
          </View>
        </View>
      </View>
    </View>
  );
};

/* --------------------------------- CTA ----------------------------------- */
/** A single CTA with:
 *  - enter animation (FadeInUp)
 *  - press scale feedback (withSpring)
 *  - shared layout for 2×2 grid
 */
const AnimatedCTA: React.FC<{
  label: string;
  onPress: () => void;
  delay?: number;
  bgClass?: string;
  textClass?: string;
}> = ({ label, onPress, delay = 0, bgClass = 'bg-white', textClass = 'text-slate-900' }) => {
  const scale = useSharedValue(1);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onIn = () => {
    scale.value = withSpring(0.98, { damping: 20, stiffness: 260 });
  };
  const onOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 180 });
  };

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(550)} style={tw`basis-[45%] mb-3`}>
      <Animated.View style={s}>
        <Pressable
          onPress={onPress}
          onPressIn={onIn}
          onPressOut={onOut}
          style={tw.style('h-12 rounded-xl items-center justify-center', bgClass)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text style={tw.style('text-base font-bold', textClass)}>{label}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

/* --------------------------- Reviews (optional) --------------------------- */
/* If you re-enable testimonials/steps later, we can reuse Animated entering props
   like <Animated.View entering={FadeInUp.delay(…)} /> for sweet staggered reveals. */

export default Landing;
