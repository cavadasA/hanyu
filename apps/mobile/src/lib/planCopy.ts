import type { PlanStep, PlanStepReason, RankReason } from '@hanyu/domain';

export function reasonToText(reason: RankReason): string {
  switch (reason.kind) {
    case 'reinforces_targets':
      return `Refuerza ${reason.count} ${reason.count === 1 ? 'palabra' : 'palabras'} que estás aprendiendo`;
    case 'comprehensible':
      return `Reconocerás alrededor del ${Math.round((reason.ratio ?? 0) * 100)} % de las palabras`;
    case 'too_easy':
      return `Tiene poco vocabulario nuevo (${Math.round((reason.ratio ?? 0) * 100)} % conocidas)`;
    case 'too_many_unknown':
      return `Tiene demasiadas palabras nuevas (${Math.round((reason.ratio ?? 0) * 100)} % conocidas)`;
    case 'new_topic':
      return 'Cubre un tema del examen que aún no has tocado';
    case 'seen_recently':
      return 'La has visto hace poco';
  }
}

export function unavailableToText(
  reason: PlanStepReason | undefined,
  kind: PlanStep['kind'],
): string {
  switch (reason) {
    case 'nothing_due':
      return 'Nada pendiente por ahora';
    case 'no_content':
      return kind === 'reading'
        ? 'Todavía no hay lecturas disponibles'
        : 'Todavía no hay ejercicios disponibles';
    case 'no_exam_date':
      return 'Añade una fecha de examen en tu perfil para activar este formato';
    case 'daily_limit_reached':
      return 'Ya has introducido las palabras nuevas de hoy';
    case 'unit_unavailable':
      return 'No hay una unidad disponible para introducir palabras nuevas ahora';
    default:
      return '';
  }
}
