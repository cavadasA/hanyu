// Pronunciación, nivel 1 (Plan 13, Tarea 3): ¿se te entiende? El reconocedor de voz del
// sistema transcribe en mandarín (zh-CN), en el dispositivo si puede, y la transcripción se
// pasa a pinyin con tonos (pinyin-pro) y se compara sílaba a sílaba con la esperada
// (comparePinyin). Se compara en pinyin, no en hanzi: un homófono (事 por 是) es un acierto.
//
// Esto no mide tonos: el modelo de lenguaje del reconocedor corrige tonos mal dichos en
// palabras frecuentes. Mide si un oyente nativo entendería la palabra.
//
// Si no hay reconocedor, no admite zh-CN o el permiso está denegado, `available` es false y
// quien lo usa no ofrece el ejercicio (regla del Plan 6).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { pinyin } from 'pinyin-pro';
import { comparePinyin, type PinyinComparison } from '@hanyu/domain';

export type SpeechCheckStatus = 'checking' | 'ready' | 'needs_permission' | 'denied' | 'unsupported';

export type SpeechCheckOutcome =
  | { status: 'heard'; transcript: string; heard: string; comparison: PinyinComparison; audioUri: string | null }
  | { status: 'unavailable'; reason: 'denied' | 'unsupported' }
  | { status: 'error'; message: string };

type RecognitionOutcome =
  | { status: 'transcribed'; transcript: string; audioUri: string | null }
  | { status: 'unavailable'; reason: 'denied' | 'unsupported' }
  | { status: 'error'; message: string };

export type TranscribeOutcome =
  | { status: 'transcribed'; transcript: string }
  | { status: 'unavailable'; reason: 'denied' | 'unsupported' }
  | { status: 'error'; message: string };

export interface SpeechTarget {
  hanzi: string;
  pinyin: string;
}

const MANDARIN = /^(zh|cmn)[-_](cn|hans)/i;

/** Transcripción → sílabas en pinyin con tono numérico; lo que no es chino se descarta. */
export function transcriptToPinyin(transcript: string): string {
  if (!transcript.trim()) return '';
  return pinyin(transcript, { toneType: 'num', type: 'array', nonZh: 'removed', v: true }).filter(Boolean).join(' ');
}

async function checkSupport(): Promise<{ status: SpeechCheckStatus; locale: string }> {
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return { status: 'unsupported', locale: 'zh-CN' };
    const { locales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const locale = locales.find((entry) => MANDARIN.test(entry));
    if (!locale) return { status: 'unsupported', locale: 'zh-CN' };
    const permission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (permission.granted) return { status: 'ready', locale: 'zh-CN' };
    return { status: permission.canAskAgain ? 'needs_permission' : 'denied', locale: 'zh-CN' };
  } catch {
    return { status: 'unsupported', locale: 'zh-CN' };
  }
}

export function useSpeechCheck() {
  const [status, setStatus] = useState<SpeechCheckStatus>('checking');
  const statusRef = useRef<SpeechCheckStatus>('checking');
  const update = (next: SpeechCheckStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  useEffect(() => {
    let alive = true;
    void checkSupport().then(({ status: next }) => {
      if (alive) update(next);
    });
    return () => {
      alive = false;
      ExpoSpeechRecognitionModule.abort?.();
    };
  }, []);

  const recognize = useCallback(async (options: {
    contextualStrings: string[];
    punctuation: boolean;
    record: boolean;
  }): Promise<RecognitionOutcome> => {
    if (statusRef.current === 'unsupported') return { status: 'unavailable', reason: 'unsupported' };
    if (statusRef.current === 'denied') return { status: 'unavailable', reason: 'denied' };
    if (statusRef.current !== 'ready') {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        update('denied');
        return { status: 'unavailable', reason: 'denied' };
      }
      update('ready');
    }

    return new Promise<RecognitionOutcome>((resolve) => {
      let transcript = '';
      let audioUri: string | null = null;
      let failure: string | null = null;
      const subscriptions = [
        ExpoSpeechRecognitionModule.addListener('result', (event) => {
          if (event.isFinal || !transcript) transcript = event.results[0]?.transcript ?? transcript;
        }),
        ExpoSpeechRecognitionModule.addListener('audioend', (event) => {
          audioUri = event.uri ?? null;
        }),
        ExpoSpeechRecognitionModule.addListener('error', (event) => {
          // Sin voz no es un fallo del sistema: se oyó nada, y eso no se entiende.
          if (event.error === 'not-allowed') {
            update('denied');
            failure = 'denied';
          } else if (event.error !== 'no-speech' && event.error !== 'speech-timeout' && event.error !== 'aborted') {
            failure = event.message || event.error;
          }
        }),
        ExpoSpeechRecognitionModule.addListener('end', () => {
          for (const subscription of subscriptions) subscription.remove();
          if (failure === 'denied') return resolve({ status: 'unavailable', reason: 'denied' });
          if (failure) return resolve({ status: 'error', message: failure });
          resolve({ status: 'transcribed', transcript, audioUri });
        }),
      ];

      const recording = options.record && ExpoSpeechRecognitionModule.supportsRecording();
      ExpoSpeechRecognitionModule.start({
        lang: 'zh-CN',
        interimResults: false,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
        addsPunctuation: options.punctuation,
        contextualStrings: options.contextualStrings,
        iosTaskHint: options.punctuation ? 'dictation' : 'confirmation',
        // El audio, en el formato que acepta la evaluación fina (pronunciation-assess).
        recordingOptions: recording
          ? { persist: true, outputSampleRate: 16000, outputEncoding: 'pcmFormatInt16' }
          : undefined,
      });
    });
  }, []);

  /** Pronunciación: ¿se entendió la palabra o frase objetivo? */
  const listen = useCallback(async (target: SpeechTarget): Promise<SpeechCheckOutcome> => {
    const outcome = await recognize({ contextualStrings: [target.hanzi], punctuation: false, record: true });
    if (outcome.status !== 'transcribed') return outcome;
    const heard = transcriptToPinyin(outcome.transcript);
    return {
      status: 'heard',
      transcript: outcome.transcript,
      heard,
      comparison: comparePinyin(target.pinyin, heard, { targetWord: target.pinyin }),
      audioUri: outcome.audioUri,
    };
  }, [recognize]);

  /** Tareas comunicativas habladas: solo la transcripción, que luego se corrige como texto. */
  const transcribe = useCallback(async (): Promise<TranscribeOutcome> => {
    const outcome = await recognize({ contextualStrings: [], punctuation: true, record: false });
    return outcome.status === 'transcribed' ? { status: 'transcribed', transcript: outcome.transcript } : outcome;
  }, [recognize]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  return {
    status,
    available: status === 'ready' || status === 'needs_permission',
    listen,
    transcribe,
    stop,
  };
}
