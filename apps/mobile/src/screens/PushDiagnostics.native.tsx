import React from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import axios, { isAxiosError } from 'axios';
import tw from '../../tailwind';
import { ensureAndroidChannel } from '../../utils/notifications';

type LogLevel = 'info' | 'error';

type LogItem = {
  id: string;
  level: LogLevel;
  message: string;
  time: string;
};

type SummaryStatus = {
  local: 'idle' | 'ok' | 'fail';
  token: 'idle' | 'ok' | 'fail';
  remote: 'idle' | 'ok' | 'fail' | 'not_configured';
};

const getProjectId = () => {
  const extra = (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ?? undefined;
  const projectId =
    (extra?.EXPO_PUBLIC_EAS_PROJECT_ID as string | undefined) ||
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return projectId;
};

const appOwnershipLabel = () => {
  if (Constants.appOwnership === 'expo') return 'Expo Go';
  if (__DEV__) return 'Dev Client';
  return 'Standalone';
};

const PushDiagnostics: React.FC = () => {
  const [logs, setLogs] = React.useState<LogItem[]>([]);
  const [expoToken, setExpoToken] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<SummaryStatus>({
    local: 'idle',
    token: 'idle',
    remote: 'not_configured',
  });
  const [loading, setLoading] = React.useState({
    permissions: false,
    token: false,
    local: false,
    remote: false,
    selfCheck: false,
  });

  const addLog = React.useCallback((message: string, level: LogLevel = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      { id: `${Date.now()}-${Math.random()}`, level, message, time },
      ...prev,
    ]);
  }, []);

  const logError = React.useCallback(
    (message: string) => addLog(`ERROR: ${message}`, 'error'),
    [addLog]
  );

  const requestPermissions = React.useCallback(async () => {
    setLoading((prev) => ({ ...prev, permissions: true }));
    try {
      const initial = await Notifications.getPermissionsAsync();
      addLog(
        `Permissions (before): status=${initial.status}, canAskAgain=${String(
          initial.canAskAgain
        )}`
      );

      let finalStatus = initial.status;
      if (initial.status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
        addLog(
          `Permissions (request): status=${requested.status}, canAskAgain=${String(
            requested.canAskAgain
          )}`
        );
      }

      if (finalStatus !== 'granted') {
        logError(`Notification permission not granted (status=${finalStatus}).`);
        return false;
      }

      addLog('✅ Notification permissions granted.');
      return true;
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setLoading((prev) => ({ ...prev, permissions: false }));
    }
  }, [addLog, logError]);

  const handleGetExpoToken = React.useCallback(async () => {
    setLoading((prev) => ({ ...prev, token: true }));
    try {
      if (!Device.isDevice) {
        logError('Expo push tokens require a physical device.');
        return;
      }

      const projectId = getProjectId();
      if (!projectId) {
        logError('Missing EAS project ID (EXPO_PUBLIC_EAS_PROJECT_ID).');
        return;
      }

      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      setExpoToken(data);
      addLog(`Expo push token: ${data}`);
      setSummary((prev) => ({ ...prev, token: 'ok' }));
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      setSummary((prev) => ({ ...prev, token: 'fail' }));
    } finally {
      setLoading((prev) => ({ ...prev, token: false }));
    }
  }, [addLog, logError]);

  const handleLocalNotification = React.useCallback(async () => {
    setLoading((prev) => ({ ...prev, local: true }));
    try {
      await ensureAndroidChannel();
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Push Diagnostics',
          body: 'Local notification test ✅',
          data: { source: 'push-diagnostics' },
        },
        trigger: { seconds: 2 },
      });
      addLog(`Scheduled local notification (id=${id}) for +2s.`);
      setSummary((prev) => ({ ...prev, local: 'ok' }));
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      setSummary((prev) => ({ ...prev, local: 'fail' }));
    } finally {
      setLoading((prev) => ({ ...prev, local: false }));
    }
  }, [addLog, logError]);

  const handleCopyToken = React.useCallback(async () => {
    if (!expoToken) return;
    try {
      await Clipboard.setStringAsync(expoToken);
      addLog('Copied Expo push token to clipboard.');
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [addLog, expoToken, logError]);

  const handleRemotePush = React.useCallback(async () => {
    if (!expoToken) {
      logError('No Expo push token available for remote test.');
      return;
    }

    setLoading((prev) => ({ ...prev, remote: true }));
    try {
      const response = await axios.post('/api/notifications/test', {
        expoPushToken: expoToken,
      });
      addLog(`Remote push test response: ${JSON.stringify(response.data)}`);
      setSummary((prev) => ({ ...prev, remote: 'ok' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404) {
        addLog('Remote push endpoint not configured (missing /api/notifications/test).');
        setSummary((prev) => ({ ...prev, remote: 'not_configured' }));
      } else {
        logError(message);
        setSummary((prev) => ({ ...prev, remote: 'fail' }));
      }
    } finally {
      setLoading((prev) => ({ ...prev, remote: false }));
    }
  }, [addLog, expoToken, logError]);

  const handleSelfCheck = React.useCallback(async () => {
    setLoading((prev) => ({ ...prev, selfCheck: true }));
    addLog('Starting self-check…');

    let localOk = false;
    let tokenOk = false;

    try {
      const permissionOk = await requestPermissions();
      if (!permissionOk) {
        setSummary((prev) => ({ ...prev, local: 'fail', token: 'fail' }));
        return;
      }

      await ensureAndroidChannel();
      addLog('Android notification channel set (default).');

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Push Diagnostics',
            body: 'Self-check local notification ✅',
          },
          trigger: { seconds: 2 },
        });
        localOk = true;
        addLog('Local notification scheduled for +2s.');
      } catch (error) {
        logError(error instanceof Error ? error.message : String(error));
      }

      if (!Device.isDevice) {
        logError('Expo push tokens require a physical device.');
      } else {
        const projectId = getProjectId();
        if (!projectId) {
          logError('Missing EAS project ID (EXPO_PUBLIC_EAS_PROJECT_ID).');
        } else {
          const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
          setExpoToken(data);
          tokenOk = Boolean(data);
          addLog(`Expo push token: ${data}`);
        }
      }
    } finally {
      setSummary((prev) => ({
        ...prev,
        local: localOk ? 'ok' : 'fail',
        token: tokenOk ? 'ok' : 'fail',
      }));
      setLoading((prev) => ({ ...prev, selfCheck: false }));
      addLog('Self-check complete.');
    }
  }, [addLog, logError, requestPermissions]);

  const deviceInfo = React.useMemo(
    () => ({
      isDevice: Device.isDevice,
      platform: Platform.OS,
      platformVersion: String(Platform.Version),
      modelName: Device.modelName ?? 'Unknown',
      osName: Device.osName ?? 'Unknown',
      osVersion: Device.osVersion ?? 'Unknown',
    }),
    []
  );

  const localStatusLabel = summary.local === 'ok' ? '✅ OK' : summary.local === 'fail' ? '❌' : '—';
  const tokenStatusLabel = summary.token === 'ok' ? '✅ OK' : summary.token === 'fail' ? '❌' : '—';
  const remoteStatusLabel =
    summary.remote === 'ok'
      ? '✅ Delivered'
      : summary.remote === 'fail'
        ? '❌ Failed'
        : summary.remote === 'not_configured'
          ? 'Not configured'
          : '—';

  return (
    <ScrollView style={tw`flex-1 bg-gray-900`} contentContainerStyle={tw`px-4 pt-16 pb-28`}>
      <Text style={tw`text-2xl font-bold text-pink-200 mb-3`}>Push Diagnostics</Text>
      <Text style={tw`text-sm text-purple-200 mb-6`}>
        Verify permissions, local notifications, and Expo push token setup.
      </Text>

      <View style={tw`bg-gray-800 rounded-2xl p-4 mb-4 border border-gray-700`}>
        <Text style={tw`text-lg font-semibold text-white mb-2`}>Device Info</Text>
        <Text style={tw`text-sm text-purple-200`}>
          Device: {deviceInfo.isDevice ? 'Physical device' : 'Emulator/Simulator'}
        </Text>
        {!deviceInfo.isDevice && (
          <Text style={tw`text-xs text-red-400 mt-1`}>
            Push tokens require a physical device.
          </Text>
        )}
        <Text style={tw`text-sm text-purple-200`}>Build: {appOwnershipLabel()}</Text>
        <Text style={tw`text-sm text-purple-200`}>
          Platform: {deviceInfo.platform} ({deviceInfo.platformVersion})
        </Text>
        <Text style={tw`text-sm text-purple-200`}>OS: {deviceInfo.osName}</Text>
        <Text style={tw`text-sm text-purple-200`}>OS Version: {deviceInfo.osVersion}</Text>
        <Text style={tw`text-sm text-purple-200`}>Model: {deviceInfo.modelName}</Text>
      </View>

      <View style={tw`bg-gray-800 rounded-2xl p-4 mb-4 border border-gray-700`}>
        <Text style={tw`text-lg font-semibold text-white mb-3`}>Actions</Text>

        <TouchableOpacity
          onPress={requestPermissions}
          style={tw`bg-purple-700 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-center`}
          disabled={loading.permissions}
        >
          {loading.permissions ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={tw`text-white font-semibold`}>Request Permissions</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleGetExpoToken}
          style={tw`bg-purple-700 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-center`}
          disabled={loading.token}
        >
          {loading.token ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={tw`text-white font-semibold`}>Get Expo Push Token</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLocalNotification}
          style={tw`bg-purple-700 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-center`}
          disabled={loading.local}
        >
          {loading.local ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={tw`text-white font-semibold`}>Test Local Notification</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSelfCheck}
          style={tw`bg-pink-500 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-center`}
          disabled={loading.selfCheck}
        >
          {loading.selfCheck ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={tw`text-white font-semibold`}>Run Self-check</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRemotePush}
          style={tw`bg-gray-700 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-center`}
          disabled={loading.remote}
        >
          {loading.remote ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={tw`text-white font-semibold`}>Remote Push Test</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={tw`bg-gray-800 rounded-2xl p-4 mb-4 border border-gray-700`}>
        <Text style={tw`text-lg font-semibold text-white mb-2`}>Expo Push Token</Text>
        {expoToken ? (
          <>
            <Text selectable style={tw`text-xs text-green-300 mb-2`}>
              {expoToken}
            </Text>
            <TouchableOpacity
              onPress={handleCopyToken}
              style={tw`bg-purple-700 rounded-xl px-4 py-2 items-center`}
            >
              <Text style={tw`text-white font-semibold`}>Copy Token</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={tw`text-sm text-purple-200`}>
            No token yet. Tap “Get Expo Push Token”.
          </Text>
        )}
      </View>

      <View style={tw`bg-gray-800 rounded-2xl p-4 mb-4 border border-gray-700`}>
        <Text style={tw`text-lg font-semibold text-white mb-2`}>Self-check Summary</Text>
        <Text style={tw`text-sm text-purple-200`}>Local notifications: {localStatusLabel}</Text>
        <Text style={tw`text-sm text-purple-200`}>Push token: {tokenStatusLabel}</Text>
        <Text style={tw`text-sm text-purple-200`}>Remote test: {remoteStatusLabel}</Text>
      </View>

      <View style={tw`bg-gray-800 rounded-2xl p-4 mb-4 border border-gray-700`}>
        <Text style={tw`text-lg font-semibold text-white mb-2`}>Remote Push Tool</Text>
        <Text style={tw`text-sm text-purple-200 mb-2`}>
          If remote push is not configured, paste the token into the Expo Push Tool:
        </Text>
        <Text selectable style={tw`text-xs text-purple-300`}>
          https://expo.dev/notifications
        </Text>
      </View>

      <View style={tw`bg-gray-800 rounded-2xl p-4 mb-6 border border-gray-700`}>
        <Text style={tw`text-lg font-semibold text-white mb-2`}>Logs</Text>
        {logs.length === 0 ? (
          <Text style={tw`text-sm text-purple-200`}>No logs yet.</Text>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={tw`mb-2`}>
              <Text
                style={tw`text-xs ${log.level === 'error' ? 'text-red-400' : 'text-purple-200'}`}
              >
                [{log.time}] {log.message}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

export default PushDiagnostics;
