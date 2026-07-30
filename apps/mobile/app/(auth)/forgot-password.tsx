import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');

    try {
      await getData().auth.sendPasswordReset(email.trim());
      setSent(true);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Reset your password</Text>

      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sent ? (
        <Text style={styles.notice}>Check your email. The reset link opens Hanyu on the web.</Text>
      ) : null}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={styles.button}>
        <Text style={styles.buttonLabel}>{busy ? 'Sending...' : 'Send reset email'}</Text>
      </Pressable>

      <Link href="/sign-in" style={styles.link}>
        Back to sign in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  button: { backgroundColor: '#c93624', borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  error: { color: '#c93624' },
  notice: { color: '#6b7280' },
  link: { paddingVertical: 6, color: '#6b7280' },
});
