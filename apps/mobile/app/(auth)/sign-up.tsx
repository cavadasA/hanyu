import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';

export default function SignUp() {
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
    <View style={styles.screen}>
      <Text style={styles.title}>Create your account</Text>

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
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={styles.button}>
        <Text style={styles.buttonLabel}>{busy ? 'Creating...' : 'Create account'}</Text>
      </Pressable>

      <Link href="/sign-in" style={styles.link}>
        I already have an account
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
