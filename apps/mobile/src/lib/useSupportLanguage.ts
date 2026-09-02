import { useEffect, useState } from 'react';
import type { SupportLanguage } from '@hanyu/data';
import { getData } from './data';

/**
 * El español es el valor inicial además del valor por defecto: la alternativa
 * sería no pintar glosa hasta que cargasen los ajustes, y un parpadeo en cada
 * tarjeta es peor que mostrar el idioma que el usuario ya tiene configurado en
 * la inmensa mayoría de los casos.
 */
export function useSupportLanguage(): SupportLanguage {
  const [language, setLanguage] = useState<SupportLanguage>('es');

  useEffect(() => {
    let active = true;
    const settings = getData().settings;

    if (!settings || typeof settings.getSettings !== 'function') {
      return () => {
        active = false;
      };
    }

    settings
      .getSettings()
      .then((settings: { support_language?: SupportLanguage }) => {
        if (active && settings?.support_language) {
          setLanguage(settings.support_language);
        }
      })
      .catch(() => {
        // Sin ajustes seguimos con el idioma por defecto; no es un error que
        // deba interrumpir una sesión de estudio.
      });

    return () => {
      active = false;
    };
  }, []);

  return language;
}
