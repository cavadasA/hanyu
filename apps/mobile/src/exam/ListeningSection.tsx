// 听力: un único reproductor recorre la línea de tiempo sin pausar, retroceder ni saltar.
// La entrada activa la decide el reloj (`elapsedMs`), no un toque: si la app vuelve de
// segundo plano, el clip que suena es el que toca por reloj, desde donde toca.
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { ServedExamForm } from '@hanyu/data';
import { activeEntryAt, questionKey } from './examModel';
import { ImageChoiceGroup, ImageTriple, TextChoice, type OnPick, type Picks } from './parts';
import { useTheme } from '../theme/ThemeProvider';

interface Props {
  form: ServedExamForm;
  elapsedMs: number;
  numbers: Record<string, number>;
  picks: Picks;
  onPick: OnPick;
  localUri(url: string): string | null;
}

/** La pregunta (slug e índice) de una entrada de la línea de tiempo. */
function itemOf(form: ServedExamForm, part: string, questionIndex: number) {
  let offset = questionIndex;
  for (const group of form.content.groups.filter(entry => entry.part === part)) {
    if (offset < group.items.length) return { slug: group.slug, index: offset };
    offset -= group.items.length;
  }
  return null;
}

function useTimelinePlayer(form: ServedExamForm, active: number, elapsedMs: number, localUri: Props['localUri']) {
  const player = useRef<AudioPlayer | null>(null);
  const elapsed = useRef(elapsedMs);
  elapsed.current = elapsedMs;

  useEffect(() => {
    if (active < 0) return;
    const entry = form.timeline[active];
    const clip = form.media.audio[entry.clip];
    const uri = clip ? localUri(clip.url) : null;
    if (!uri) return;
    const current = createAudioPlayer({ uri });
    player.current = current;
    const offset = (elapsed.current - entry.at_ms) / 1000;
    if (offset > 0.5) void (current as { seekTo?: (seconds: number) => Promise<void> }).seekTo?.(offset);
    current.play();
    return () => {
      const stale = current as { remove?: () => void; release?: () => void };
      if (stale.remove) stale.remove();
      else stale.release?.();
      player.current = null;
    };
  }, [active, form, localUri]);
}

export function ListeningSection({ form, elapsedMs, numbers, picks, onPick, localUri }: Props) {
  const { colors } = useTheme();
  const active = activeEntryAt(form.timeline, elapsedMs);
  useTimelinePlayer(form, active, elapsedMs, localUri);

  const entry = active >= 0 ? form.timeline[active] : null;
  const item = entry?.kind === 'item' ? itemOf(form, entry.part, entry.question_index) : null;
  const now = item
    ? `Ahora: pregunta ${numbers[questionKey(item.slug, item.index)]}`
    : entry?.kind === 'example'
      ? 'Ahora: ejemplo'
      : 'Ahora: instrucciones';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.now, { color: colors.vermilion }]}>{now}</Text>
      {form.content.groups
        .filter(group => group.part === 'L1' || group.part === 'L2' || group.part === 'L3')
        .map(group => {
          const activeIndex = item?.slug === group.slug ? item.index : null;
          const common = { numbers, picks, onPick, activeIndex };
          if (group.part === 'L1') return <ImageTriple key={group.slug} group={group} images={form.media.images} localUri={localUri} {...common} />;
          if (group.part === 'L2') return <ImageChoiceGroup key={group.slug} group={group} images={form.media.images} localUri={localUri} {...common} />;
          return <TextChoice key={group.slug} group={group as Extract<typeof group, { part: 'L3' }>} {...common} />;
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  now: { fontSize: 17, fontWeight: '700' },
});
