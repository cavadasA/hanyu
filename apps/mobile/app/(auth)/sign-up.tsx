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
        setNotice('Revisa tu correo para confirmar la cuenta y vuelve aquí para entrar.');
      }
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScaffold title="Crea tu cuenta">
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <NoticeBanner message={notice} /> : null}

      <AuthField
        label="Correo electrónico"
        placeholder="tu@ejemplo.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <AuthField
        label="Contraseña"
        placeholder="Al menos 8 caracteres"
        secure
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />

      <AuthSubmit label="Crear cuenta" busyLabel="Creando…" busy={busy} onPress={submit} />

      <View style={styles.footer}>
        <Text style={{ color: colors.textMuted, fontSize: tokens.fontSize.sm }}>
          ¿Ya tienes cuenta?{' '}
        </Text>
        <Link href="/sign-in" style={[styles.footerLink, { color: colors.vermilion }]}>
          Entrar
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
