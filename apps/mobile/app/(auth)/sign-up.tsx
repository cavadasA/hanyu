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
import { NoticeBanner } from '../../src/ui/NoticeBanner';

export default function SignUp() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = await getData().auth.signUp({ email: email.trim(), password });
      if (!result.session) {
        setNotice('Check your email to confirm your account, then return here to sign in.');
      }
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScaffold title="Create your account">
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <NoticeBanner message={notice} /> : null}

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
        placeholder="At least 8 characters"
        secure
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />

      <AuthSubmit label="Create account" busyLabel="Creating…" busy={busy} onPress={submit} />

      <View style={styles.footer}>
        <Text style={{ color: colors.textMuted, fontSize: tokens.fontSize.sm }}>
          Already have an account?{' '}
        </Text>
        <Link href="/sign-in" style={[styles.footerLink, { color: colors.vermilion }]}>
          Sign in
        </Link>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
  },
  footerLink: { fontSize: tokens.fontSize.sm, fontWeight: '700' },
});
