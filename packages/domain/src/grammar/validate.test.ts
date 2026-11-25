import { describe, expect, it } from 'vitest';
import { validateGrammarEntry, type GrammarEntry } from './validate';

const dictionary = [
  { hanzi: '我', hsk_level: 1 },
  { hanzi: '你', hsk_level: 1 },
  { hanzi: '看', hsk_level: 1 },
  { hanzi: '了', hsk_level: 1 },
  { hanzi: '书', hsk_level: 1 },
  { hanzi: '这', hsk_level: 1 },
  { hanzi: '本', hsk_level: 1 },
  { hanzi: '吃', hsk_level: 1 },
  { hanzi: '饭', hsk_level: 1 },
  { hanzi: '试', hsk_level: 1 },
  { hanzi: '一', hsk_level: 1 },
  { hanzi: '小', hsk_level: 1 },
  { hanzi: '第', hsk_level: 2 },
  { hanzi: '已经', hsk_level: 2 },
  { hanzi: '三', hsk_level: 1 },
  { hanzi: '个', hsk_level: 1 },
  { hanzi: '小时', hsk_level: 1 },
  { hanzi: '睡觉', hsk_level: 1 },
  { hanzi: '八', hsk_level: 1 },
  { hanzi: '跳舞', hsk_level: 2 },
];

const ctx = {
  dictionary,
  known_points: [
    { hsk_level: 1, code: '2.2.1' },
    { hsk_level: 2, code: '2.2.1' },
  ],
};

function valid(): GrammarEntry {
  return {
    hsk_level: 2,
    code: '2.2.1',
    pattern: 'V + V / V + 一 + V',
    explanation: 'Repetir un verbo suaviza la acción: indica que dura poco o que se hace de forma relajada.',
    markers: ['看看', '试一试'],
    examples: [
      { zh: '你看看这本书。', pinyin: 'Nǐ kànkan zhè běn shū.', es: 'Échale un vistazo a este libro.' },
      { zh: '我试一试。', pinyin: 'Wǒ shì yi shì.', es: 'Lo pruebo un momento.' },
      { zh: '我看看。', pinyin: 'Wǒ kànkan.', es: 'Déjame ver.' },
    ],
    common_errors: [
      { wrong: '我看看了三个小时书。', right: '我看了三个小时书。', why: 'La reduplicación indica brevedad; no encaja con una duración larga.' },
    ],
    see_also: [{ hsk_level: 1, code: '2.2.1' }],
  };
}

const kinds = (entry: GrammarEntry) => validateGrammarEntry(entry, ctx).map(issue => issue.kind);

describe('validateGrammarEntry', () => {
  it('acepta una entrada correcta', () => {
    expect(validateGrammarEntry(valid(), ctx)).toEqual([]);
  });

  it('exige al menos 3 ejemplos', () => {
    const entry = valid();
    entry.examples = entry.examples.slice(0, 2);
    entry.markers = ['看看', '试一试'];
    expect(kinds(entry)).toContain('too_few_examples');
  });

  it('exige al menos un error típico', () => {
    const entry = valid();
    entry.common_errors = [];
    expect(kinds(entry)).toEqual(['no_common_error']);
  });

  it('exige al menos un marcador', () => {
    const entry = valid();
    entry.markers = [];
    expect(kinds(entry)).toContain('no_markers');
  });

  it('rechaza un ejemplo que no contiene ningún marcador', () => {
    const entry = valid();
    entry.markers = ['看看'];
    entry.examples = [
      { zh: '我看了书。', pinyin: 'Wǒ kàn le shū.', es: 'Leí el libro.' },
      { zh: '你看看这本书。', pinyin: 'Nǐ kànkan zhè běn shū.', es: 'Échale un vistazo a este libro.' },
      { zh: '我看看。', pinyin: 'Wǒ kànkan.', es: 'Déjame ver.' },
    ];
    expect(validateGrammarEntry(entry, ctx)).toEqual([{ kind: 'marker_absent', example_index: 0 }]);
  });

  it('rechaza un marcador que no aparece en ningún ejemplo', () => {
    const entry = valid();
    entry.markers = ['看看', '试一试', '吃吃'];
    expect(validateGrammarEntry(entry, ctx)).toEqual([{ kind: 'marker_unused', detail: '吃吃' }]);
  });

  it('normaliza los marcadores morfológicos con guion (小—, 第—)', () => {
    const entry = valid();
    entry.hsk_level = 2;
    entry.markers = ['小—', '第 —'];
    entry.examples = [
      { zh: '小书。', pinyin: 'Xiǎo shū.', es: 'Librito.' },
      { zh: '第一本书。', pinyin: 'Dì yī běn shū.', es: 'El primer libro.' },
      { zh: '第三个。', pinyin: 'Dì sān gè.', es: 'El tercero.' },
    ];
    expect(validateGrammarEntry(entry, ctx)).toEqual([]);
  });

  it('rechaza en un punto de nivel 1 vocabulario de nivel 2', () => {
    const entry = valid();
    entry.hsk_level = 1;
    entry.see_also = [];
    entry.examples = [
      { zh: '我已经看看了。', pinyin: 'Wǒ yǐjīng kànkan le.', es: 'Ya he echado un vistazo.' },
      { zh: '我试一试。', pinyin: 'Wǒ shì yi shì.', es: 'Lo pruebo un momento.' },
      { zh: '我看看。', pinyin: 'Wǒ kànkan.', es: 'Déjame ver.' },
    ];
    expect(validateGrammarEntry(entry, ctx)).toEqual([
      { kind: 'unknown_vocabulary', example_index: 0, detail: '已' },
      { kind: 'unknown_vocabulary', example_index: 0, detail: '经' },
    ]);
  });

  it('rechaza un nombre propio fuera de diccionario', () => {
    const entry = valid();
    entry.examples[2] = { zh: '王看看。', pinyin: 'Wáng kànkan.', es: 'Wang echa un vistazo.' };
    expect(validateGrammarEntry(entry, ctx)).toEqual([
      { kind: 'unknown_vocabulary', example_index: 2, detail: '王' },
    ]);
  });

  it('exige pinyin y traducción en cada ejemplo', () => {
    const entry = valid();
    entry.examples[1] = { zh: '我试一试。', pinyin: ' ', es: '' };
    expect(validateGrammarEntry(entry, ctx)).toEqual([
      { kind: 'missing_pinyin', example_index: 1 },
      { kind: 'missing_translation', example_index: 1 },
    ]);
  });

  it('rechaza una explicación en inglés', () => {
    const entry = valid();
    entry.explanation = 'Reduplication is used to soften the verb.';
    expect(kinds(entry)).toEqual(['english_explanation']);
  });

  it('rechaza la forma «X (pinyin) means Y»', () => {
    const entry = valid();
    entry.explanation = '看看 (kànkan) means echar un vistazo.';
    expect(kinds(entry)).toEqual(['means_pattern']);
  });

  it('rechaza see_also hacia un punto que no existe', () => {
    const entry = valid();
    entry.see_also = [{ hsk_level: 4, code: '9.9.9' }];
    expect(validateGrammarEntry(entry, ctx)).toEqual([{ kind: 'see_also_unknown', detail: '4-9.9.9' }]);
  });

  it('distingue el mismo código en otro nivel en see_also', () => {
    const entry = valid();
    entry.see_also = [{ hsk_level: 3, code: '2.2.1' }];
    expect(validateGrammarEntry(entry, ctx)).toEqual([{ kind: 'see_also_unknown', detail: '3-2.2.1' }]);
  });

  it('acepta un verbo separable del nivel partido por otras palabras (睡了八个小时觉)', () => {
    const entry = valid();
    entry.hsk_level = 1;
    entry.see_also = [];
    entry.markers = ['觉'];
    entry.examples = [
      { zh: '我睡了八个小时觉。', pinyin: 'Wǒ shuì le bā gè xiǎoshí jiào.', es: 'Dormí ocho horas.' },
      { zh: '我睡觉了。', pinyin: 'Wǒ shuìjiào le.', es: 'Me fui a dormir.' },
      { zh: '你睡了几个小时觉？', pinyin: 'Nǐ shuì le jǐ gè xiǎoshí jiào?', es: '¿Cuántas horas dormiste?' },
    ];
    const issues = validateGrammarEntry(entry, ctx).filter(issue => issue.kind === 'unknown_vocabulary');
    expect(issues).toEqual([{ kind: 'unknown_vocabulary', example_index: 2, detail: '几' }]);
  });

  it('no acepta la mitad de un verbo separable si la otra no está antes, ni si el verbo es de otro nivel', () => {
    const entry = valid();
    entry.hsk_level = 1;
    entry.see_also = [];
    entry.markers = ['了'];
    entry.examples = [
      { zh: '我觉了。', pinyin: 'x', es: 'x' },
      { zh: '我舞了。', pinyin: 'x', es: 'x' },
      { zh: '我看了书。', pinyin: 'x', es: 'x' },
    ];
    expect(validateGrammarEntry(entry, ctx).filter(issue => issue.kind === 'unknown_vocabulary')).toEqual([
      { kind: 'unknown_vocabulary', example_index: 0, detail: '觉' },
      { kind: 'unknown_vocabulary', example_index: 1, detail: '舞' },
    ]);
  });
});
