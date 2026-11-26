// Reviews enseñaba «Deck breakdown» y «N due» de antes de la sesión (new 503 / 10 due
// tras estudiar 6) hasta que se cambiaba de modo: nada volvía a pedir los contadores
// al cerrar la sesión ni al volver a la pestaña.
import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/** Fase de la pantalla en la que se ve el resumen con los contadores. */
const OVERVIEW = 'pre-session';

export function useReloadOnReturn(phase: string, reload: () => void): void {
  const latest = useRef({ phase, reload });
  latest.current = { phase, reload };

  // Al cerrar una sesión y volver al resumen.
  const previous = useRef(phase);
  useEffect(() => {
    if (previous.current === 'reviewing' && phase === OVERVIEW) reload();
    previous.current = phase;
  }, [phase, reload]);

  // Al volver a la pestaña (la primera vez ya carga la propia pantalla).
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current && latest.current.phase === OVERVIEW) latest.current.reload();
      focusedBefore.current = true;
    }, []),
  );
}
