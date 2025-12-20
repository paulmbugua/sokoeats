// apps/mobile/src/components/DeleteAccount.native.tsx
import React, { useState, useEffect, Fragment } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  StyleProp,
  TextStyle,
  ViewStyle,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Dimensions,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '@mytutorapp/shared/hooks';
import tw from '../../tailwind';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  label?: string;
  buttonStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const REQUIRED_TOKEN = 'DELETE';
const normalize = (s: string) => s.normalize('NFKC').trim().toUpperCase();

const DeleteAccount: React.FC<Props> = ({ label = 'Delete Account', buttonStyle, textStyle }) => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { height: winH } = Dimensions.get('window');
  const CARD_MAX_H = Math.round(winH * 0.9); // 90% of viewport height

  const navigateLoose = (name: string) => {
    try {
      (navigation as unknown as { navigate: (n: string) => void }).navigate(name);
    } catch {
      navigation.navigate('Home');
    }
  };

  const { handleDeleteAccount, isDeleting, deleteError } = useAuth({
    alertFn: (msg: string) => Alert.alert('', msg),
    navigateFn: (destination?: string) => {
      if (destination && destination.trim().length > 0) navigateLoose(destination);
      else navigation.navigate('Home');
    },
  });

  const [isModalOpen, setModalOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const canDelete = confirmChecked && normalize(confirmText) === REQUIRED_TOKEN;

  useEffect(() => {
    if (deleteError?.message) Alert.alert('Error', deleteError.message);
  }, [deleteError]);

  return (
    <Fragment>
      {/* Inline trigger button (fits next to "Log out") */}
      <TouchableOpacity
        onPress={() => setModalOpen(true)}
        disabled={isDeleting}
        style={[
          tw`h-9 px-3 rounded-lg items-center justify-center bg-red-600 ${isDeleting ? 'opacity-60' : ''} flex-row`,
          buttonStyle,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <FontAwesome name="trash" size={16} color="#fff" />
        <Text style={[tw`text-white font-semibold ml-2 text-sm`, textStyle]}>{label}</Text>
      </TouchableOpacity>

      {/* Confirmation modal */}
      <Modal
        visible={isModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={tw`flex-1`}
        >
          <View style={tw`flex-1 bg-black/40 justify-center items-center px-4`}>
            <View
              style={[
                tw`w-11/12 max-w-lg bg-[#0f1821] rounded-2xl p-6 border border-white/10`,
                { maxHeight: CARD_MAX_H },
              ]}
            >
              {/* Header */}
              <View style={tw`flex-row items-center justify-between mb-4`}>
                <Text style={tw`text-2xl font-semibold text-white`}>Delete Account?</Text>
                <TouchableOpacity
                  onPress={() => setModalOpen(false)}
                  disabled={isDeleting}
                  accessibilityRole="button"
                  accessibilityLabel="Close delete dialog"
                >
                  <FontAwesome name="times" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Body (no ScrollView, compact spacing) */}
              <View>
                <Text style={tw`text-gray-300 text-sm leading-relaxed mb-3`}>
                  Deleting your account will deactivate your access and remove or anonymize your
                  personal information. Please review what will happen:
                </Text>
                <View style={tw`pl-1`}>
                  <Text style={tw`text-gray-300 text-sm mb-2`}>
                    • <Text style={tw`font-semibold text-gray-200`}>Account deactivation:</Text> You
                    will be signed out and can’t sign in again.
                  </Text>
                  <Text style={tw`text-gray-300 text-sm mb-2`}>
                    • <Text style={tw`font-semibold text-gray-200`}>Personal data removal:</Text>{' '}
                    Your name and email are erased or anonymized.
                  </Text>
                  <Text style={tw`text-gray-300 text-sm`}>
                    • <Text style={tw`font-semibold text-gray-200`}>Irreversible:</Text> This cannot
                    be undone.
                  </Text>
                </View>

                {/* Confirmations */}
                <View style={tw`mt-4`}>
                  {/* Big checkbox row (tap anywhere to toggle) */}
                  <Pressable
                    onPress={() => setConfirmChecked((v) => !v)}
                    style={tw`flex-row items-start`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: confirmChecked }}
                    accessibilityLabel="I understand my personal information will be removed/anonymized and this action cannot be undone."
                  >
                    <View
                      style={tw`h-7 w-7 rounded border border-gray-400 bg-white items-center justify-center mr-3`}
                    >
                      {confirmChecked ? (
                        <FontAwesome name="check" size={16} color="#dc2626" />
                      ) : null}
                    </View>

                    <Text style={tw`flex-1 text-sm leading-6 text-gray-200`}>
                      I understand my personal information will be removed/anonymized and this
                      action cannot be undone.
                    </Text>
                  </Pressable>

                  {/* Type DELETE input */}
                  <View style={tw`mt-3`}>
                    <Text style={tw`text-xs text-gray-400 mb-1`}>
                      Type <Text style={tw`font-bold text-gray-200`}>{REQUIRED_TOKEN}</Text> to
                      confirm
                    </Text>
                    <TextInput
                      value={confirmText}
                      onChangeText={setConfirmText}
                      placeholder={REQUIRED_TOKEN}
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={tw`w-full rounded-md bg-[#1a2733] text-white px-3 py-2`}
                      accessibilityLabel={`Type ${REQUIRED_TOKEN} to confirm`}
                    />
                    {confirmText.length > 0 && !canDelete && (
                      <Text style={tw`mt-1 text-xs text-red-300`}>
                        Please type {REQUIRED_TOKEN} exactly and tick the checkbox.
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Footer actions */}
              <View style={tw`flex-row justify-end mt-6`}>
                <TouchableOpacity
                  onPress={() => setModalOpen(false)}
                  disabled={isDeleting}
                  style={tw`px-4 py-2 rounded-md bg-gray-700 mr-3 ${isDeleting ? 'opacity-60' : ''}`}
                >
                  <Text style={tw`text-gray-200`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    if (!canDelete) return;
                    await handleDeleteAccount();
                    setModalOpen(false);
                  }}
                  disabled={isDeleting || !canDelete}
                  style={tw`px-4 py-2 rounded-md bg-red-600 ${isDeleting || !canDelete ? 'opacity-60' : ''}`}
                  accessibilityState={{ disabled: isDeleting || !canDelete }}
                >
                  <Text style={tw`text-white font-semibold`}>
                    {isDeleting ? 'Deleting…' : 'Yes, Delete'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Fragment>
  );
};

export default DeleteAccount;
