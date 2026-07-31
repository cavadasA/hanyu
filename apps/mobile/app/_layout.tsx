import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session/SessionProvider';
import { OfflineReviewProvider } from '../src/offline/OfflineReviewProvider';
import { ThemeProvider } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <OfflineReviewProvider>
          <ThemeProvider>
            <StatusBar style="auto" />
            <Slot />
          </ThemeProvider>
        </OfflineReviewProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
