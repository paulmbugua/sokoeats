// apps/mobile/src/screens/CustomGoogleLoginButton.native.tsx
import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Alert, Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import tw from '../../tailwind';
import { logGoogleAuthFlow, summarizeGoogleIdToken } from '../utils/googleAuthDebug';

type GoogleButtonProps = {
  onSuccess: (idToken: string) => Promise<void>;
  onFailure: (error?: Error) => void;
};

type GoogleSignInError = {
  code?: string;
  message?: string;
  [k: string]: unknown;
};

function getErrCode(e: unknown): string {
  return typeof e === 'object' &&
    e &&
    'code' in e &&
    typeof (e as GoogleSignInError).code === 'string'
    ? (e as GoogleSignInError).code!
    : '';
}
function getErrMessage(e: unknown): string {
  return typeof e === 'object' &&
    e &&
    'message' in e &&
    typeof (e as GoogleSignInError).message === 'string'
    ? (e as GoogleSignInError).message!
    : String(e);
}

const CustomGoogleLoginButtonNative: React.FC<GoogleButtonProps> = ({ onSuccess, onFailure }) => {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async (): Promise<void> => {
    if (loading) return;
    logGoogleAuthFlow('button_press', { platform: Platform.OS });
    setLoading(true);
    try {
      // Clear any cached session to reduce silent failures across accounts
      try {
        logGoogleAuthFlow('sign_out_cached_session:start');
        await GoogleSignin.signOut();
        logGoogleAuthFlow('sign_out_cached_session:ok');
      } catch (signOutError: unknown) {
        // Non-fatal: continue with sign-in flow
        logGoogleAuthFlow('sign_out_cached_session:non_fatal_error', {
          message: signOutError instanceof Error ? signOutError.message : String(signOutError),
        });
      }

      if (Platform.OS === 'android') {
        logGoogleAuthFlow('play_services_check:start');
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        logGoogleAuthFlow('play_services_check:ok');
      }

      // Launch the native Google sign-in UI
      logGoogleAuthFlow('native_sign_in:start');
      const signInResult = await GoogleSignin.signIn();
      logGoogleAuthFlow('native_sign_in:ok', {
        type: typeof signInResult,
        keys: signInResult && typeof signInResult === 'object' ? Object.keys(signInResult) : [],
      });

      // Retrieve tokens (idToken is what your backend typically needs)
      logGoogleAuthFlow('get_tokens:start');
      const { idToken, accessToken } = await GoogleSignin.getTokens();
      logGoogleAuthFlow('get_tokens:ok', {
        hasAccessToken: Boolean(accessToken),
        idToken: summarizeGoogleIdToken(idToken),
      });
      if (!idToken) {
        throw new Error('No ID token received');
      }

      logGoogleAuthFlow('handoff_to_screen:start');
      await onSuccess(idToken);
      logGoogleAuthFlow('handoff_to_screen:ok');
    } catch (e: unknown) {
      const code = getErrCode(e);
      const rawMessage = getErrMessage(e);
      logGoogleAuthFlow('native_sign_in:error', {
        code,
        message: rawMessage,
        name: e instanceof Error ? e.name : undefined,
      });
      const base = 'Failed to sign in with Google';
      const message =
        code === statusCodes.SIGN_IN_CANCELLED
          ? 'Sign in cancelled'
          : code === statusCodes.IN_PROGRESS
            ? 'Sign in already in progress'
            : code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
              ? 'Google Play services not available'
              : code === '10' || getErrMessage(e).includes('DEVELOPER_ERROR')
                ? 'Google is not configured for this build. Rebuild after adding the EAS keystore SHA-1/SHA-256 to Firebase and using the latest google-services.json.'
                : getErrMessage(e).includes('No ID token')
                  ? 'Google authentication failed - no token'
                  : base;

      // Surface error and notify caller
      Alert.alert('Google Sign-In', message);
      onFailure(e instanceof Error ? e : new Error(getErrMessage(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleGoogleSignIn}
      disabled={loading}
      style={[
        tw`bg-primary py-3 px-4 rounded-lg flex-row items-center justify-center shadow`,
        loading && tw`opacity-60`,
      ]}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
    >
      <Text style={tw`text-white font-semibold`}>
        {loading ? 'Signing in…' : 'Continue with Google'}
      </Text>
      {loading && <ActivityIndicator style={tw`ml-2`} />}
    </TouchableOpacity>
  );
};

export default CustomGoogleLoginButtonNative;
