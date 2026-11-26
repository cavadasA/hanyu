// El modo de estudio que pide quien abre Reviews (p. ej. «Start learning» en Hoy).
//
// Hoy hacía router.push('/cards') sin modo y la pantalla no leía ninguno, así que
// «Start learning» abría Reviews en modo Review. Reviews es una pestaña: sus
// parámetros se quedan puestos, de modo que cada enlace lleva además `at`, distinto
// en cada pulsación, para que pedir otra vez el mismo modo vuelva a aplicarse.
import { useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { StudyMode } from '@hanyu/data';

const MODES: readonly string[] = ['learn', 'review', 'exam'];

export function studyModeHref(mode: StudyMode) {
  return { pathname: '/cards', params: { mode, at: String(Date.now()) } } as const;
}

export function useRequestedStudyMode(onRequest: (mode: StudyMode) => void): void {
  const { mode, at } = useLocalSearchParams<{ mode?: string; at?: string }>();
  const callback = useRef(onRequest);
  callback.current = onRequest;

  useEffect(() => {
    if (typeof mode === 'string' && MODES.includes(mode)) callback.current(mode as StudyMode);
  }, [mode, at]);
}
