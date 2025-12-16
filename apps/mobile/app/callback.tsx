import { Redirect, useLocalSearchParams } from 'expo-router';

export default function CallbackAlias() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/paystack/callback', params }} />;
}
