// apps/mobile/src/pages/RobotTutor.native.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../tailwind';
import RobotTeacher from '../screens/RobotTeacher.native';

// Shared refresh container
import { RefreshableScrollView } from '../refresh/Refreshable';

// ⬇️ Local type escape so we can use the extra `screenId` prop
const RefreshableAny: any = RefreshableScrollView;

const RobotTutorScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
    >
      <RefreshableAny
        screenId="robot-tutor"
        contentContainerStyle={[
          tw`py-6`,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
        keyboardShouldPersistTaps="always"
      >
        <View style={tw`mx-auto w-full max-w-[1120px] px-3`}>
          {/* ✅ Welcome UI (not SSML) */}
          <View style={tw`mb-3 rounded-2xl border border-white/10 bg-white/5 p-4`}>
            <Text style={tw`text-[#0d141c] dark:text-white font-black text-xl`}>
              Robot Tutor
            </Text>
            <Text style={tw`text-[#49739c] dark:text-white/70 mt-1`}>
              Pick a course (or type a topic), then tap Start to generate your lesson.
            </Text>
          </View>

          {/* ✅ Don’t feed fallback SSML to the audio player */}
          <RobotTeacher initialSsml="" voiceName="en-US-Wavenet-F" />
        </View>
      </RefreshableAny>
    </SafeAreaView>
  );
};

export default RobotTutorScreen;
