// apps/mobile/src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from './navigation/types';

// ✅ use your existing storage wrapper (not ./storage/session)
import { storage } from '../utils/storage';

// screens (keep your paths)
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

const TOKEN_KEY = 'auth:token';

type TabParamList = {
  Home: undefined;
  Requests: undefined;
  Messages: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const colors = {
  primary: '#2563EB',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: { height: 64, paddingBottom: 10, paddingTop: 6 },
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === 'Home'
              ? 'home-outline'
              : route.name === 'Requests'
              ? 'document-text-outline'
              : route.name === 'Messages'
              ? 'chatbubble-ellipses-outline'
              : 'person-outline';
          return <Ionicons name={name as any} color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Requests" component={RequestsScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [token, setTok] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = await storage.getItem(TOKEN_KEY);
      setTok(t);
      setBooted(true);
    })();
  }, []);

  const auth = useMemo(
    () => ({
      token,
      setToken: async (t: string | null) => {
        if (!t) await storage.removeItem(TOKEN_KEY);
        else await storage.setItem(TOKEN_KEY, t);
        setTok(t);
      },
    }),
    [token]
  );

  if (!booted) return null;

  return (
    <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      {!auth.token ? (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account' }} />
          <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} options={{ title: 'Verify Phone Number' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />

          <Stack.Screen name="CategorySelect" component={CategorySelectScreen} />
          <Stack.Screen name="TaskSelect" component={TaskSelectScreen} />
          <Stack.Screen name="DescribeIssue" component={DescribeIssueScreen} />
          <Stack.Screen name="PhotoUpload" component={PhotoUploadScreen} />
          <Stack.Screen name="LocationSelect" component={LocationSelectScreen} />
          <Stack.Screen name="ScheduleSelect" component={ScheduleSelectScreen} />
          <Stack.Screen name="JobDetails" component={JobDetailsScreen} />
          <Stack.Screen name="ReviewRequest" component={ReviewRequestScreen} />
          <Stack.Screen name="RequestSubmitted" component={RequestSubmittedScreen} />

          <Stack.Screen name="QuotesInbox" component={QuotesInboxScreen} />
          <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
          <Stack.Screen name="BookingConfirmed" component={BookingConfirmedScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}