import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';
import { tokens } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AuthScaffold } from '../../src/ui/AuthScaffold';
import { AuthField } from '../../src/ui/AuthField';
import { AuthSubmit } from '../../src/ui/AuthSubmit';
import { ErrorBanner } from '../../src/ui/ErrorBanner';
import { NoticeBanner } from '../../src/ui/NoticeBanner';

export default function ForgotPassword() {
  const { colors } = useTheme();
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
    <AuthScaffold title="Recupera tu contraseña">
      {error ? <ErrorBanner message={error} /> : null}
      {sent ? (
        <NoticeBanner message="Revisa tu correo. El enlace para cambiar la contraseña abre Hanyu en la web." />
      ) : null}

      <AuthField
        label="Correo electrónico"
        placeholder="tu@ejemplo.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <AuthSubmit label="Enviar enlace" busyLabel="Enviando…" busy={busy} onPress={submit} />

      <View style={styles.footer}>
        <Link href="/sign-in" style={[styles.footerLink, { color: colors.vermilion }]}>
          Volver a entrar
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
