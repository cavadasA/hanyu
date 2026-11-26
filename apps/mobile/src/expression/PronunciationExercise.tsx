// Pronunciación (Plan 13, Tareas 3 y 4). Nivel 1, sin red: el reconocedor del sistema dice
// si se te entendió, sílaba a sílaba. No mide tonos (el reconocedor corrige tonos mal dichos
// en palabras frecuentes), así que esta pantalla no habla de tonos.
//
// Nivel 2, con red: si la Edge Function pronunciation-assess responde 200, se añade la
// puntuación de Azure por sílaba, y solo entonces se habla de sonidos y tonos.
//
// Sin reconocedor en chino o sin permiso, el ejercicio no se ofrece: lo explica, enlaza a
// Ajustes si es el permiso, y avisa con onUnavailable. No es un fallo del alumno: no hay nota.
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { convert } from 'pinyin-pro';
import type { Grade, PinyinComparison } from '@hanyu/domain';
import type { AssessOutcome } from '@hanyu/data';
import { AudioButton } from '../ui/AudioButton';
import { Button } from '../ui/Button';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { assessRecording } from './assessRecording';
import { useSpeechCheck, type SpeechCheckOutcome } from './useSpeechCheck';

export interface PronunciationWord {
  hanzi: string;
  pinyin: string;
  meaning: string | null;
  /** Clip del Plan 10 si la palabra lo tiene; si no, voz sintética. */
  audioUrl?: string | null;
}

interface Props {
  word: PronunciationWord;
  onGraded: (result: { grade: Grade; intelligible: boolean }) => void;
  onUnavailable: (reason: 'denied' | 'unsupported') => void;
  /** Evaluación fina; por defecto, la Edge Function pronunciation-assess. */
  assess?: (input: { audioUri: string; referenceText: string }) => Promise<AssessOutcome>;
}

/** Todas las sílabas entendidas → Good; inteligible con alguna sin entender → Hard; si no → Again. */
export function pronunciationGrade(comparison: PinyinComparison): Grade {
  if (!comparison.intelligible) return 'again';
  return comparison.syllables.every((syllable) => syllable.ok) ? 'good' : 'hard';
}

const marks = (syllable: string) => convert(syllable.replace(/5$/, '0'), { format: 'numToSymbol' });

export function PronunciationExercise({ word, onGraded, onUnavailable, assess = assessRecording }: Props) {
  const { colors } = useTheme();
  const speech = useSpeechCheck();
  const [listening, setListening] = useState(false);
  const [outcome, setOutcome] = useState<Extract<SpeechCheckOutcome, { status: 'heard' }> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [fine, setFine] = useState<Extract<AssessOutcome, { status: 'scored' }>['assessment'] | null>(null);

  const [deniedNow, setDeniedNow] = useState(false);
  const unavailable = deniedNow ? 'denied' : speech.status === 'denied' || speech.status === 'unsupported' ? speech.status : null;
  const announced = useRef(false);
  useEffect(() => {
    if (!unavailable || announced.current) return;
    announced.current = true;
    onUnavailable(unavailable);
    // onUnavailable puede cambiar de identidad en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unavailable]);

  const speak = async () => {
    setFailure(null);
    setOutcome(null);
    setFine(null);
    setListening(true);
    const result = await speech.listen({ hanzi: word.hanzi, pinyin: word.pinyin });
    setListening(false);
    if (result.status === 'unavailable') {
      if (result.reason === 'denied') setDeniedNow(true); // el efecto de arriba avisa
      return;
    }
    if (result.status === 'error') {
      setFailure('El reconocedor de voz falló. Prueba otra vez.');
      return;
    }
    setOutcome(result);
    if (result.audioUri) {
      const scored = await assess({ audioUri: result.audioUri, referenceText: word.hanzi }).catch(() => null);
      if (scored?.status === 'scored') setFine(scored.assessment);
    }
  };

  if (unavailable === 'unsupported') {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Este dispositivo no tiene reconocimiento de voz en chino, así que no hay ejercicios de pronunciación.
        </Text>
      </View>
    );
  }

  if (unavailable === 'denied') {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Para practicar la pronunciación, Hanyu necesita el micrófono y el reconocimiento de voz. Puedes activarlos en Ajustes.
        </Text>
        <Button label="Abrir Ajustes" variant="outline" onPress={() => void Linking.openSettings()} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.hanzi, { color: colors.text }]}>{word.hanzi}</Text>
      <Text style={[styles.pinyin, { color: colors.textMuted }]}>{word.pinyin}</Text>
      {word.meaning ? <Text style={[styles.meaning, { color: colors.textMuted }]}>{word.meaning}</Text> : null}
      <AudioButton text={word.hanzi} audioUrl={word.audioUrl} label="Escuchar" />

      {outcome ? (
        <View style={styles.result}>
          <Text style={[styles.verdict, { color: outcome.comparison.intelligible ? colors.success : colors.vermilion }]}>
            {outcome.comparison.intelligible ? 'Se te entendió' : 'No se te entendió'}
          </Text>
          <View style={styles.syllables}>
            {outcome.comparison.syllables.map((syllable, index) => (
              <View
                key={`${syllable.expected}-${index}`}
                accessibilityLabel={`sílaba ${marks(syllable.expected)} ${syllable.ok ? 'entendida' : 'no entendida'}`}
                style={[styles.syllable, { borderColor: syllable.ok ? colors.success : colors.vermilion }]}
              >
                <Text style={[styles.syllableText, { color: colors.text }]}>{marks(syllable.expected)}</Text>
                <Text style={[styles.heard, { color: colors.textMuted }]}>
                  {syllable.heard ? `se oyó ${marks(syllable.heard)}` : 'no se oyó'}
                </Text>
              </View>
            ))}
          </View>

          {fine ? (
            <View style={styles.fine}>
              <Text style={[styles.fineTitle, { color: colors.text }]}>Sonidos y tonos, por sílaba (0–100)</Text>
              <View style={styles.syllables}>
                {fine.syllables.map((syllable, index) => (
                  <View key={`${syllable.syllable}-${index}`} style={[styles.syllable, { borderColor: colors.border }]}>
                    <Text style={[styles.syllableText, { color: colors.text }]}>{syllable.syllable}</Text>
                    <Text style={[styles.heard, { color: colors.textMuted }]}>{String(syllable.accuracy)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Button
            label="Continuar"
            onPress={() =>
              onGraded({ grade: pronunciationGrade(outcome.comparison), intelligible: outcome.comparison.intelligible })
            }
          />
        </View>
      ) : (
        <Button
          label={listening ? 'Escuchando…' : 'Hablar'}
          sublabel={listening ? undefined : 'Di la palabra en voz alta'}
          onPress={listening ? speech.stop : () => void speak()}
        />
      )}
      {failure ? <Text style={[styles.note, { color: colors.vermilion }]}>{failure}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: tokens.spacing.md },
  hanzi: { fontSize: 48, textAlign: 'center', fontWeight: '500' },
  pinyin: { fontSize: tokens.fontSize.lg, textAlign: 'center' },
  meaning: { fontSize: tokens.fontSize.md, textAlign: 'center' },
  result: { gap: tokens.spacing.md },
  verdict: { fontSize: tokens.fontSize.lg, fontWeight: '700', textAlign: 'center' },
  syllables: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' },
  syllable: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  syllableText: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  heard: { fontSize: tokens.fontSize.sm },
  fine: { gap: tokens.spacing.sm },
  fineTitle: { fontSize: tokens.fontSize.md, fontWeight: '600', textAlign: 'center' },
  note: { fontSize: tokens.fontSize.md, textAlign: 'center' },
});
