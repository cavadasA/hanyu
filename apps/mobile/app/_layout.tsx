import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session/SessionProvider';
import { ThemeProvider } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Slot />
        </ThemeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
