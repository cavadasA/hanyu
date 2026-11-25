// Quién es dueño de cada directorio de audio y qué clips espera. Cada área de
// contenido registra aquí su resolvedor: `readings/<slug>` (Plan 10); el
// simulacro del Plan 12 añade el suyo.
import { loadReadings, loadSeries } from '../build-readings.js';
import { readingAudioExpectations } from './reading-audio.js';

export function readingOwner(slug) {
  return `readings/${slug}`;
}

export function defaultExpectationsFor() {
  const series = loadSeries();
  const readings = new Map(loadReadings().map(reading => [readingOwner(reading.slug), reading]));

  return owner => {
    const reading = readings.get(owner);
    if (!reading) return null;
    return readingAudioExpectations(reading, series.find(entry => entry.code === reading.series));
  };
}
