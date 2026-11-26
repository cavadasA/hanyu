// La acepción de cada palabra de una lectura se resuelve en la build: lo que
// falle aquí no llega al lector, y lo que se resuelve viaja en el seed hasta la
// Edge Function tokenize-reading.
import { describe, expect, it } from 'vitest';
import { loadReadings, validateCatalog } from './build-readings.js';
import { buildSeedSql } from './build-supabase-seed.js';
import { loadWordRows, readingSenses } from './lib/reading-senses.js';

const words = loadWordRows();

function reading(sentences, senses) {
  return { slug: 'prueba', hsk_level: 2, sentences, ...(senses ? { senses } : {}) };
}

const pedir = { zh: '我们点了两个菜。', pinyin: 'Wǒmen diǎn le liǎng gè cài.', es: 'Pedimos dos platos.' };

describe('readingSenses', () => {
  it('点 «pedir» frente a 点 «tocar» no lo decide el pinyin: sin anotación, sense_unresolved', () => {
    expect(readingSenses(reading([pedir]), words).issues).toEqual([
      { kind: 'sense_unresolved', sentence_index: 0, detail: '点' },
    ]);
  });

  it('con la anotación, la frase lleva la acepción resuelta para la Edge Function', () => {
    const result = readingSenses(
      reading([pedir], [{ sentence: 0, hanzi: '点', occurrence: 0, hsk_level: 2, sense_index: 2 }]),
      words,
    );
    expect(result.issues).toEqual([]);
    expect(result.sentences[0]).toEqual({
      ...pedir,
      senses: [{ hanzi: '点', occurrence: 0, hsk_level: 2, sense_index: 2 }],
    });
  });

  it('las palabras que se resuelven solas (好, duplicada en HSK 1 y 2) no se anotan en la frase', () => {
    const sentence = { zh: '我很好。', pinyin: 'Wǒ hěn hǎo.', es: 'Estoy bien.' };
    const result = readingSenses(reading([sentence]), words);
    expect(result.issues).toEqual([]);
    expect(result.sentences[0]).toEqual(sentence);
  });

  it('los hanzi del nombre de un personaje no son vocabulario: no piden acepción', () => {
    const sentence = { zh: '花花很好。', pinyin: 'Huāhua hěn hǎo.', es: 'Huahua está bien.' };
    expect(readingSenses(reading([sentence]), words).issues.map(issue => issue.kind)).toContain('sense_unresolved');
    expect(readingSenses(reading([sentence]), words, ['花花']).issues).toEqual([]);
  });

  it('un pinyin que no se puede repartir entre los hanzi da pinyin_unaligned', () => {
    const sentence = { zh: '我很好。', pinyin: 'Wǒ hěn.', es: 'Estoy bien.' };
    expect(readingSenses(reading([sentence]), words).issues).toEqual([
      { kind: 'pinyin_unaligned', sentence_index: 0, detail: '我很好。' },
    ]);
  });
});

describe('catálogo de lecturas: acepciones', () => {
  it('ninguna lectura tiene acepciones sin resolver, en conflicto o por encima de su nivel', () => {
    const kinds = ['sense_unresolved', 'sense_conflict', 'annotation_orphan', 'sense_above_level', 'pinyin_unaligned'];
    const problems = validateCatalog().flatMap(entry =>
      entry.issues
        .filter(issue => kinds.includes(issue.kind))
        .map(issue => `${entry.slug} frase ${issue.sentence_index + 1}: ${issue.kind} ${issue.detail}`),
    );
    expect(problems).toEqual([]);
  });

  it('el seed lleva en cada frase las acepciones resueltas', () => {
    const annotated = loadReadings().find(entry => readingSenses(entry, words).sentences.some(sentence => sentence.senses));
    expect(annotated).toBeDefined();
    expect(buildSeedSql().sql).toContain('"senses":[{"hanzi":');
  });
});
