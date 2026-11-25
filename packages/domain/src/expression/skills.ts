// packages/domain/src/expression/skills.ts
//
// Pronunciación y escritura son habilidades con estado de memoria propio, como
// las cinco anteriores. Pero no todo objetivo las admite: el sílabo 3.0 solo
// pide escribir a mano los caracteres de su lista 书写字, y la pronunciación se
// practica con palabras. Crear estados fuera de eso llenaría la cola de
// ejercicios que el examen no pide.
export const LEARNING_SKILLS = [
  'recognition',
  'recall',
  'listening',
  'reading',
  'production',
  'pronunciation',
  'writing',
] as const;

export type ExpressionSkill = 'pronunciation' | 'writing';

export type ExpressionTarget =
  | { kind: 'word' }
  | { kind: 'grammar' }
  | { kind: 'character'; handwriting: boolean };

export function expressionSkillsFor(target: ExpressionTarget): ExpressionSkill[] {
  switch (target.kind) {
    case 'word':
      return ['pronunciation'];
    case 'character':
      return target.handwriting ? ['writing'] : [];
    case 'grammar':
      return [];
  }
}
