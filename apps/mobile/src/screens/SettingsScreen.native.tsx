// apps/mobile/src/screens/Settings.native.tsx

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ToastAndroid,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, NavigationProp } from '@react-navigation/native';
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CreateProfileForm from './CreateProfileForm.native';
import ManageProfileForm from './ManageProfileForm.native';
import AccountSection from './AccountSection.native';
import CertificationSettings from './CertificationSettings.native';
import DeleteAccountScreen from './DeleteAccount.native'; // ← import it here
import { useSettings } from '@mytutorapp/shared/hooks';
import tw from '../../tailwind';

type RootStackParamList = {
  Home: undefined;
};

const showToast = (message: string) => {
  Platform.OS === 'android'
    ? ToastAndroid.show(message, ToastAndroid.SHORT)
    : Alert.alert('', message);
};

const getIconName = (id: string): keyof typeof FontAwesome.glyphMap => {
  switch (id) {
    case 'account':
      return 'user-circle';
    case 'manageProfile':
      return 'edit';
    case 'certification':
      return 'certificate';
    case 'help':
      return 'question-circle';
    case 'language':
      return 'globe';
    case 'logout':
      return 'power-off';
    default:
      return 'user-circle';
  }
};

const SettingsNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { success, section } = (route.params || {}) as { success?: string; section?: string };
  const paymentSuccess = success === 'true';

  useEffect(() => {
    if (paymentSuccess) {
      showToast('Payment was successful! Your tokens have been updated.');
    }
  }, [paymentSuccess]);

  const { hasProfile, activeSection, menuItems, handleMenuClick } = useSettings({
    alertFn: (title, message) => showToast(`${title}: ${message}`),
    navigateFn: (dest) => navigation.navigate(dest as keyof RootStackParamList),
    initialSection: section,
  });

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'account':
        return <AccountSection />;

      case 'manageProfile':
        return hasProfile ? <ManageProfileForm /> : <CreateProfileForm />;

      case 'certification':
        return <CertificationSettings />;

      case 'help':
        return (
          <View style={tw`items-center mt-6`}>
            <Text style={tw`text-lg font-medium text-white mb-4`}>Help Center</Text>
            <DeleteAccountScreen />
          </View>
        );

      case 'language':
        return <Text style={tw`text-white text-center mt-10`}>Language Settings</Text>;

      default:
        return <Text style={tw`text-white text-center mt-10`}>Account Details</Text>;
    }
  };

  return (
    <View style={tw`flex-1 bg-gray-900`}>
      {/* Main Content */}
      <View style={tw`flex-1 pt-20 px-4 pb-36`}>
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`flex-grow`}
          showsVerticalScrollIndicator={false}
        >
          <Text style={tw`text-3xl font-bold text-pink-300 mb-6 text-center`}>
            {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}
          </Text>
          {renderActiveSection()}
        </ScrollView>
      </View>

      {/* Bottom Navigation Tabs */}
      <LinearGradient
        colors={['#4C1D95', '#7C3AED']}
        start={[0, 0]}
        end={[1, 0]}
        style={tw`absolute bottom-0 left-0 right-0 py-3 px-6 rounded-t-2xl shadow-xl border-t border-purple-800`}
      >
        <View style={tw`flex-row justify-between`}>
          {menuItems
            .filter((item) => item.id !== 'logout')
            .map((item) => {
              const isActive = item.id === activeSection;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() =>
                    handleMenuClick({ ...item, icon: item.icon ?? getIconName(item.id) })
                  }
                  style={tw`items-center flex-1`}
                  disabled={item.disabled}
                >
                  <FontAwesome
                    name={getIconName(item.id)}
                    size={24}
                    color={item.disabled ? 'gray' : isActive ? '#F472B6' : '#E9D5FF'}
                  />
                  <Text
                    style={tw`mt-1 text-xs ${item.disabled ? 'text-gray-500' : isActive ? 'text-pink-400' : 'text-purple-200'}`}
                  >
                    {item.label}
                  </Text>
                  {isActive && <View style={tw`h-1 w-6 bg-pink-400 rounded-full mt-1`} />}
                </TouchableOpacity>
              );
            })}
        </View>
      </LinearGradient>
    </View>
  );
};

export default SettingsNative;
