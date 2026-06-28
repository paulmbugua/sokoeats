import React from 'react';

import { ActivityIndicator, View } from 'react-native';

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useShopContext } from '@myhandymanapp/shared/context';

import type { RootStackParamList } from './navigation/types';

import WelcomeScreen from './screens/WelcomeScreen';

import OnboardingScreen from './screens/OnboardingScreen';

import LoginScreen from './screens/auth/LoginScreen';

import SignUpScreen from './screens/auth/SignUpScreen';

import OtpVerifyScreen from './screens/auth/OtpVerifyScreen';

import HomeScreen from './screens/tabs/HomeScreen';

import RequestsScreen from './screens/tabs/RequestsScreen';

import MessagesScreen from './screens/tabs/MessagesScreen';

import ProfileScreen from './screens/tabs/ProfileScreen';

import CategorySelectScreen from './screens/request/CategorySelectScreen';

import TaskSelectScreen from './screens/request/TaskSelectScreen';

import DescribeIssueScreen from './screens/request/DescribeIssueScreen';

import PhotoUploadScreen from './screens/request/PhotoUploadScreen';

import LocationSelectScreen from './screens/request/LocationSelectScreen';

import ScheduleSelectScreen from './screens/request/ScheduleSelectScreen';

import JobDetailsScreen from './screens/request/JobDetailsScreen';

import ReviewRequestScreen from './screens/request/ReviewRequestScreen';

import RequestSubmittedScreen from './screens/request/RequestSubmittedScreen';

import QuotesInboxScreen from './screens/quotes/QuotesInboxScreen';

import QuoteDetailScreen from './screens/quotes/QuoteDetailScreen';

import BookingConfirmedScreen from './screens/booking/BookingConfirmedScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const Tab = createBottomTabNavigator();

const primary = '#16A34A';

function Tabs() {

  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (

    <Tab.Navigator screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: primary, tabBarInactiveTintColor: '#6B7280', tabBarStyle: { height: 58 + bottomInset, paddingBottom: bottomInset, paddingTop: 6 }, tabBarLabelStyle: { paddingBottom: 2, fontSize: 11, fontWeight: '700' }, tabBarHideOnKeyboard: true, tabBarIcon: ({ color, size }) => {

      const name = route.name === 'Home' ? 'home-outline' : route.name === 'Requests' ? 'document-text-outline' : route.name === 'Messages' ? 'chatbubble-ellipses-outline' : 'person-outline';

      return <Ionicons name={name as any} color={color} size={size} />;

    } })}>

      <Tab.Screen name="Home" component={HomeScreen} />

      <Tab.Screen name="Requests" component={RequestsScreen} />

      <Tab.Screen name="Messages" component={MessagesScreen} />

      <Tab.Screen name="Profile" component={ProfileScreen} />

    </Tab.Navigator>

  );

}

export default function App() {

  const { token, initializing } = useShopContext();

  if (initializing) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}><ActivityIndicator color={primary} /></View>;

  return (

    <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>

      {!token ? <>

        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />

        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />

        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />

        <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account' }} />

        <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} options={{ title: 'Verify Phone Number' }} />

      </> : <>

        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />

        <Stack.Screen name="CategorySelect" component={CategorySelectScreen} options={{ title: 'Choose Service' }} />

        <Stack.Screen name="TaskSelect" component={TaskSelectScreen} options={{ title: 'Choose Task' }} />

        <Stack.Screen name="DescribeIssue" component={DescribeIssueScreen} options={{ title: 'Describe Job' }} />

        <Stack.Screen name="PhotoUpload" component={PhotoUploadScreen} options={{ title: 'Add Photos' }} />

        <Stack.Screen name="LocationSelect" component={LocationSelectScreen} options={{ title: 'Location' }} />

        <Stack.Screen name="ScheduleSelect" component={ScheduleSelectScreen} options={{ title: 'Schedule' }} />

        <Stack.Screen name="JobDetails" component={JobDetailsScreen} options={{ title: 'Budget' }} />

        <Stack.Screen name="ReviewRequest" component={ReviewRequestScreen} options={{ title: 'Review' }} />

        <Stack.Screen name="RequestSubmitted" component={RequestSubmittedScreen} options={{ title: 'Submitted' }} />

        <Stack.Screen name="QuotesInbox" component={QuotesInboxScreen} options={{ title: 'Quotes' }} />

        <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} options={{ title: 'Quote Detail' }} />

        <Stack.Screen name="BookingConfirmed" component={BookingConfirmedScreen} options={{ title: 'Booking Confirmed' }} />

      </>}

    </Stack.Navigator>

  );

}

