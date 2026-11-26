import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Root error boundary.
 *
 * Why it exists: in RN 0.86, render errors are reported through React 19's
 * `onUncaughtError`/`onCaughtError` → `ReactFiberErrorDialog` →
 * `ExceptionsManager` (LogBox redbox on the device), and the dialog returns
 * `false` so React never logs the error to `console.error`. The Metro terminal
 * therefore only shows a one-line `ERROR [message]` summary.
 *
 * This boundary:
 *  1. logs the full JS stack (via `console.error(error)`) plus the React
 *     component stack to the Metro terminal, and
 *  2. renders a fallback UI instead of leaving a blank tree.
 *
 * Note: in development the LogBox redbox still appears on the device for
 * caught errors (RN behavior); the fallback UI is what users see in release
 * builds, where LogBox is off.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The Error object must be the first argument so Hermes serializes its
    // stack into the Metro terminal log.
    console.error(error);
    if (info.componentStack) {
      console.error(`[AppErrorBoundary] Component stack:\n${info.componentStack}`);
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Algo ha fallado</Text>
          <Text style={styles.message}>{error.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={this.handleRetry}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

// Fallback styles are hardcoded (no theme tokens): the ThemeProvider may
// itself sit below this boundary and be unavailable when the error renders.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#111827',
  },
  title: { color: '#f9fafb', fontSize: 20, fontWeight: '700' },
  message: { color: '#d1d5db', fontSize: 14, textAlign: 'center' },
  button: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#c93624',
  },
  buttonLabel: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
