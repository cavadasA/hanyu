// Forma del catálogo de lecturas: series completas, temas cubiertos y
// continuidad mínima. El maestro pide miniseries con continuidad narrativa; la
// única comprobación determinista de continuidad es que cada episodio tenga en
// escena a alguien de su serie. Lo demás (que el hilo avance) lo revisa quien
// lee el diff.
import type { ReadingSource } from './validate.ts';

export type ReadingTopic =
  | 'vida diaria'
  | 'estudio'
  | 'trabajo'
  | 'eventos'
  | 'lugares'
  | 'compras'
  | 'salud'
  | 'ocio'
  | 'comunicación interpersonal';

/** Los nueve temas del maestro, en su orden. */
export const READING_TOPICS: ReadingTopic[] = [
  'vida diaria',
  'estudio',
  'trabajo',
  'eventos',
  'lugares',
  'compras',
  'salud',
  'ocio',
  'comunicación interpersonal',
];

export interface SeriesCharacter {
  name: string;
  role_es: string;
  /** Voz neuronal del personaje (Plan 10, Tarea 6). */
  voice?: string;
}

export interface SeriesDeclaration {
  code: string;
  title: string;
  topic: ReadingTopic;
  characters: SeriesCharacter[];
  planned_episodes: number;
  /** Voz que lee los textos que no son diálogo. */
  narrator_voice?: string;
}

export type CatalogIssueKind =
  | 'series_gap'
  | 'series_unknown'
  | 'series_overfull'
  | 'topic_mismatch'
  | 'topic_missing'
  | 'orphan_reading'
  | 'character_absent'
  | 'format_unbalanced';

export interface CatalogIssue {
  kind: CatalogIssueKind;
  detail: string;
}

export type CatalogReading = Pick<ReadingSource, 'slug' | 'topic' | 'sentences'> & {
  series: string | null;
  series_index: number | null;
};

export function validateCatalogShape(
  readings: CatalogReading[],
  series: SeriesDeclaration[],
  options: { topics?: string[] } = {},
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const byCode = new Map(series.map(declaration => [declaration.code, declaration]));
  const indexesBySeries = new Map<string, number[]>();

  for (const reading of readings) {
    if (reading.series === null || reading.series === undefined) {
      issues.push({ kind: 'orphan_reading', detail: reading.slug });
      continue;
    }

    const declaration = byCode.get(reading.series);
    if (!declaration) {
      issues.push({ kind: 'series_unknown', detail: `${reading.slug}: ${reading.series}` });
      continue;
    }

    if (reading.topic !== declaration.topic) {
      issues.push({
        kind: 'topic_mismatch',
        detail: `${reading.slug}: ${reading.topic} ≠ ${declaration.topic}`,
      });
    }

    const text = reading.sentences.map(sentence => sentence.zh).join('');
    if (!declaration.characters.some(character => text.includes(character.name))) {
      issues.push({ kind: 'character_absent', detail: `${reading.slug} (${reading.series})` });
    }

    const indexes = indexesBySeries.get(reading.series) ?? [];
    indexes.push(reading.series_index ?? 0);
    indexesBySeries.set(reading.series, indexes);
  }

  for (const declaration of series) {
    const indexes = indexesBySeries.get(declaration.code) ?? [];
    const beyond = indexes.filter(index => index > declaration.planned_episodes || index < 1);
    if (beyond.length > 0 || indexes.length > declaration.planned_episodes) {
      issues.push({
        kind: 'series_overfull',
        detail: `${declaration.code}: ${indexes.length} lecturas, ${declaration.planned_episodes} previstas`,
      });
    }

    const missing: number[] = [];
    for (let index = 1; index <= declaration.planned_episodes; index += 1) {
      if (!indexes.includes(index)) missing.push(index);
    }
    if (missing.length > 0) {
      issues.push({
        kind: 'series_gap',
        detail: `${declaration.code}: faltan los episodios ${missing.join(', ')}`,
      });
    }
  }

  const covered = new Set(series.map(declaration => declaration.topic as string));
  for (const topic of options.topics ?? READING_TOPICS) {
    if (!covered.has(topic)) {
      issues.push({ kind: 'topic_missing', detail: topic });
    }
  }

  return issues;
}

/** Problemas que sólo cuentan cuando el corpus se declara terminado. */
export const COMPLETENESS_KINDS: CatalogIssueKind[] = ['series_gap', 'topic_missing', 'format_unbalanced'];
