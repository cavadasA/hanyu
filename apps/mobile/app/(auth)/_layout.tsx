import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../../src/session/SessionProvider';

export default function AuthLayout() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/today" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
