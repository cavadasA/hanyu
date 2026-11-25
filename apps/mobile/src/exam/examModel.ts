// Lo que el simulacro necesita calcular sin pintar nada: numeración de las preguntas como
// en la hoja de respuestas, la entrada activa de 听力 por reloj, cuándo acaba 听力 y
// qué medios hay que descargar antes de empezar.
import type { ServedExamForm } from '@hanyu/data';
import type { TimelineEntry } from '@hanyu/domain';

/** Minutos de cada fase tras 听力 (exam-structure.json, portada de la muestra 3.0). */
export const EXAM_MINUTES = { answer_sheet: 3, reading: 25, writing: 10 } as const;

export const questionKey = (slug: string, index: number) => `${slug}:${index}`;

export function questionNumbers(form: Pick<ServedExamForm, 'content'>): Record<string, number> {
  const numbers: Record<string, number> = {};
  let next = 1;
  for (const group of form.content.groups) {
    group.items.forEach((_, index) => {
      numbers[questionKey(group.slug, index)] = next;
      next += 1;
    });
  }
  return numbers;
}

/** Índice de la última entrada que ya ha empezado, o -1 antes de la primera. */
export function activeEntryAt(timeline: TimelineEntry[], elapsedMs: number): number {
  let active = -1;
  for (let index = 0; index < timeline.length; index += 1) {
    if (timeline[index].at_ms <= elapsedMs) active = index;
    else break;
  }
  return active;
}

export function listeningEndMs(form: Pick<ServedExamForm, 'timeline' | 'media'>): number {
  const last = form.timeline[form.timeline.length - 1];
  if (!last) return 0;
  return last.at_ms + (form.media.audio[last.clip]?.duration_ms ?? 0);
}

export function mediaUrls(form: Pick<ServedExamForm, 'media'>): string[] {
  return [...new Set([
    ...Object.values(form.media.audio).map(clip => clip.url),
    ...Object.values(form.media.images).map(image => image.url),
  ])];
}
