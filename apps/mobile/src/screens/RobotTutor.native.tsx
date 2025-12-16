import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../tailwind';
import RobotTeacher from '../screens/RobotTeacher.native';

const DEFAULT_SSML = `<speak>
  <p>Hello! I am your robot tutor.</p>
  <p>Today we will learn fractions. <break time="400ms"/></p>
  <p>Repeat after me: one half. one third. one quarter.</p>
</speak>`;

const RobotTutorScreen: React.FC = () => {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
    >
      <View style={tw`flex-1`}>
        <RobotTeacher initialSsml={DEFAULT_SSML} voiceName="en-US-Wavenet-F" />
      </View>
    </SafeAreaView>
  );
};

export default RobotTutorScreen;
