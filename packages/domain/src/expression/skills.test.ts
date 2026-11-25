// packages/domain/src/expression/skills.test.ts
import { LEARNING_SKILLS, expressionSkillsFor } from './skills';

describe('habilidades de expresión', () => {
  it('hay siete habilidades, las cinco de siempre más pronunciación y escritura', () => {
    expect(LEARNING_SKILLS).toEqual([
      'recognition',
      'recall',
      'listening',
      'reading',
      'production',
      'pronunciation',
      'writing',
    ]);
  });

  it('no crea estado de escritura para un carácter que el sílabo solo pide leer', () => {
    expect(expressionSkillsFor({ kind: 'character', handwriting: false })).toEqual([]);
  });

  it('crea estado de escritura para un carácter de la lista 书写字', () => {
    expect(expressionSkillsFor({ kind: 'character', handwriting: true })).toEqual(['writing']);
  });

  it('la pronunciación es de palabras, no de caracteres ni de gramática', () => {
    expect(expressionSkillsFor({ kind: 'word' })).toEqual(['pronunciation']);
    expect(expressionSkillsFor({ kind: 'grammar' })).toEqual([]);
  });
});
