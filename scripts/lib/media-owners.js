// Quién es dueño de cada directorio de audio y qué clips espera. Cada área de
// contenido registra aquí su resolvedor: `readings/<slug>` (Plan 10); el
// simulacro del Plan 12 añade el suyo.
import { loadReadings, loadSeries } from '../build-readings.js';
import { readingAudioExpectations } from './reading-audio.js';
import { examAudioExpectations } from './exam-audio.js';
import { examDir as defaultExamDir, listExamForms, loadExamForm, loadExamInstructions, loadExamStructure } from './exam.js';

export function readingOwner(slug) {
  return `readings/${slug}`;
}

/** `exam/hsk<n>/<forma>` (Plan 12): los clips de la línea de tiempo de 听力 de esa forma. */
function examExpectationsFor(owner, examDir) {
  const match = /^exam\/hsk(\d)\/([A-Z])$/.exec(owner);
  if (!match) return null;
  const level = Number(match[1]);
  if (!listExamForms(level, examDir).includes(match[2])) return null;
  return examAudioExpectations(
    loadExamForm(level, match[2], examDir),
    loadExamInstructions(level, examDir),
    loadExamStructure(),
  );
}

export function defaultExpectationsFor({ examDir = defaultExamDir } = {}) {
  const series = loadSeries();
  const readings = new Map(loadReadings().map(reading => [readingOwner(reading.slug), reading]));

  return owner => {
    if (owner.startsWith('exam/')) return examExpectationsFor(owner, examDir);
    const reading = readings.get(owner);
    if (!reading) return null;
    return readingAudioExpectations(reading, series.find(entry => entry.code === reading.series));
  };
}
