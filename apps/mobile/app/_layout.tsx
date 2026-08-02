import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session/SessionProvider';
import { OfflineReviewProvider } from '../src/offline/OfflineReviewProvider';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { AppErrorBoundary } from '../src/ui/AppErrorBoundary';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <SessionProvider>
          <OfflineReviewProvider>
            <ThemeProvider>
              <StatusBar style="auto" />
              <Slot />
            </ThemeProvider>
          </OfflineReviewProvider>
        </SessionProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
