import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';
import { tokens } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AuthScaffold } from '../../src/ui/AuthScaffold';
import { AuthField } from '../../src/ui/AuthField';
import { AuthSubmit } from '../../src/ui/AuthSubmit';
import { ErrorBanner } from '../../src/ui/ErrorBanner';

export default function SignIn() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');

    try {
      await getData().auth.signIn({ email: email.trim(), password });
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScaffold title="Welcome back">
      {error ? <ErrorBanner message={error} /> : null}

      <AuthField
        label="Email"
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <AuthField
        label="Password"
        placeholder="••••••••"
        secure
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
        trailing={
          <Link href="/forgot-password" style={[styles.inlineLink, { color: colors.vermilion }]}>
            Forgot?
          </Link>
        }
      />

      <AuthSubmit label="Sign in" busyLabel="Signing in…" busy={busy} onPress={submit} />

      <View style={styles.footer}>
        <Text style={{ color: colors.textMuted, fontSize: tokens.fontSize.sm }}>New to Hanyu? </Text>
        <Link href="/sign-up" style={[styles.footerLink, { color: colors.vermilion }]}>
          Create an account
        </Link>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  inlineLink: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
  },
  footerLink: { fontSize: tokens.fontSize.sm, fontWeight: '700' },
});
