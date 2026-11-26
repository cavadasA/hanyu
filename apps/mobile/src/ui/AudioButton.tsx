import { useEffect, useRef } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSpeech } from '../audio/useSpeech';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function AudioButton({
  text,
  audioUrl,
  label = 'Reproducir audio',
}: {
  text: string;
  audioUrl?: string | null;
  label?: string;
}) {
  const { colors } = useTheme();
  const { speak } = useSpeech();
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => () => {
    player.current?.release();
    player.current = null;
  }, []);

  function play() {
    if (!audioUrl) {
      void speak(text);
      return;
    }

    if (!player.current) {
      player.current = createAudioPlayer(audioUrl);
    } else {
      player.current.replace(audioUrl);
    }
    player.current.play();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={play}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.7 : 1,
          ...(pressed ? { transform: [{ scale: 0.98 }] } : {}),
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    justifyContent: 'center',
    minHeight: 44,
  },
  label: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
});
