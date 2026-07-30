import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';

export default function SignIn() {
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
    <View style={styles.screen}>
      <Text style={styles.title}>Sign in to Hanyu</Text>

      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Password"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={styles.button}>
        <Text style={styles.buttonLabel}>{busy ? 'Signing in...' : 'Sign in'}</Text>
      </Pressable>

      <Link href="/sign-up" style={styles.link}>
        Create an account
      </Link>
      <Link href="/forgot-password" style={styles.link}>
        Forgot your password?
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
  link: { paddingVertical: 6, color: '#6b7280' },
});
