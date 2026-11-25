// Línea de tiempo del audio de 听力: un único reproductor la recorre sin pausas ni saltos,
// y la pregunta que se ve en pantalla la decide `at_ms`, no un toque. Es determinista:
// los clips con su duración real, las veces que suena cada ítem (`plays`) y las pausas
// medidas en el mp3 de la muestra oficial (exam-structure.json, docs/hsk/hsk2-3.0-estructura.md).
import { examPartStructure, type ExamGroup, type ExamPartCode, type ExamStructure } from './types.ts';

export type ListeningPart = Extract<ExamPartCode, 'L1' | 'L2' | 'L3'>;

export interface TimelineEntry {
  at_ms: number;
  kind: 'instruction' | 'example' | 'item';
  part: ListeningPart;
  /** Índice de la pregunta dentro de la parte; -1 en instrucciones y ejemplos. */
  question_index: number;
  clip: string;
  play: number;
}

const LISTENING_PARTS: ListeningPart[] = ['L1', 'L2', 'L3'];
/** Tope: los «约 17 分钟» de la portada; el mp3 de la muestra dura 17:48,6. */
export const LISTENING_MAX_MS = 18 * 60 * 1000;

// Silencios medidos en el mp3 de la muestra que no dependen de la parte.
/** Tras la instrucción general, antes de la de L1 (58,7 → 60,0 s). */
const AFTER_OPENING_MS = 1300;
/** Tras la instrucción de una parte, antes del ejemplo (72,6 → 73,7 s). */
const AFTER_INSTRUCTION_MS = 1100;
/** Tras «现在开始第…题», antes del primer ítem (3,4 / 3,2 / 3,3 s). */
const AFTER_START_MS = 3300;

export const pad2 = (value: number) => String(value).padStart(2, '0');

/** Clave del clip de la pregunta `index` (0, 1…) de una parte: `L2-q06`. */
export function itemClipKey(part: ListeningPart, index: number): string {
  return `${part}-q${pad2(index + 1)}`;
}

function partGroups(groups: ExamGroup[], part: ListeningPart) {
  return groups.filter(group => group.part === part);
}

function hasExample(groups: ExamGroup[], part: ListeningPart): boolean {
  return partGroups(groups, part).some(group => 'example' in group && group.example);
}

function itemCount(groups: ExamGroup[], part: ListeningPart): number {
  return partGroups(groups, part).reduce((count, group) => count + group.items.length, 0);
}

/** Todos los clips que necesita la línea de tiempo de una forma, en orden de aparición. */
export function listeningClipKeys(groups: ExamGroup[]): string[] {
  const keys = ['opening'];
  for (const part of LISTENING_PARTS) {
    keys.push(`${part}-instruction`);
    if (hasExample(groups, part)) keys.push(`${part}-example`);
    keys.push(`${part}-start`);
    for (let index = 0; index < itemCount(groups, part); index += 1) keys.push(itemClipKey(part, index));
  }
  keys.push('closing');
  return keys;
}

export function buildListeningTimeline(
  groups: ExamGroup[],
  structure: ExamStructure,
  clipMs: Record<string, number>,
): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let at = 0;

  const duration = (clip: string) => {
    const ms = clipMs[clip];
    if (!Number.isFinite(ms) || ms <= 0) throw new Error(`El clip ${clip} no tiene duración`);
    return ms;
  };
  const say = (part: ListeningPart, clip: string, after: number) => {
    timeline.push({ at_ms: at, kind: 'instruction', part, question_index: -1, clip, play: 1 });
    at += duration(clip) + after;
  };

  say('L1', 'opening', AFTER_OPENING_MS);

  for (const part of LISTENING_PARTS) {
    const shape = examPartStructure(structure, part);
    const plays = shape.plays ?? 1;
    const between = shape.pause_between_plays_ms ?? 0;
    const after = shape.pause_after_item_ms ?? 0;
    const repeat = (kind: 'example' | 'item', clip: string, question_index: number) => {
      for (let play = 1; play <= plays; play += 1) {
        timeline.push({ at_ms: at, kind, part, question_index, clip, play });
        at += duration(clip) + (play < plays ? between : after);
      }
    };

    say(part, `${part}-instruction`, AFTER_INSTRUCTION_MS);
    if (hasExample(groups, part)) repeat('example', `${part}-example`, -1);
    say(part, `${part}-start`, AFTER_START_MS);
    for (let index = 0; index < itemCount(groups, part); index += 1) {
      repeat('item', itemClipKey(part, index), index);
    }
  }

  say('L3', 'closing', 0);

  if (at > LISTENING_MAX_MS) {
    throw new Error(`听力 dura ${Math.round(at / 1000)} s: pasa de los 18 min`);
  }
  return timeline;
}
