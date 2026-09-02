import { dedupeOfficialTerms, parseOfficialTerm, loadOfficialWords } from './official-terms.js';

describe('parseOfficialTerm', () => {
  it('separa el índice de sentido del hanzi', () => {
    expect(parseOfficialTerm('点1')).toEqual({ form: '点', sense_index: 1, variants: ['点'] });
    expect(parseOfficialTerm('过去2')).toEqual({ form: '过去', sense_index: 2, variants: ['过去'] });
  });

  it('deja el índice a null cuando el término no lo lleva', () => {
    expect(parseOfficialTerm('爱情')).toEqual({ form: '爱情', sense_index: null, variants: ['爱情'] });
  });

  it('expande la parte opcional en dos variantes, con la larga como canónica', () => {
    expect(parseOfficialTerm('没（有）')).toEqual({
      form: '没有',
      sense_index: null,
      variants: ['没有', '没'],
    });
    expect(parseOfficialTerm('有（一）点儿')).toEqual({
      form: '有一点儿',
      sense_index: null,
      variants: ['有一点儿', '有点儿'],
    });
  });

  it('combina paréntesis e índice', () => {
    expect(parseOfficialTerm('有时（候）2')).toEqual({
      form: '有时候',
      sense_index: 2,
      variants: ['有时候', '有时'],
    });
  });

  it('no confunde un numeral chino con un índice', () => {
    expect(parseOfficialTerm('一')).toEqual({ form: '一', sense_index: null, variants: ['一'] });
  });
});

describe('loadOfficialWords', () => {
  it('lee los conteos oficiales de la revisión 2025', () => {
    expect(loadOfficialWords(1)).toHaveLength(300);
    expect(loadOfficialWords(2)).toHaveLength(204);
    expect(loadOfficialWords(3)).toHaveLength(507);
  });

  it('conserva los índices que trae la transcripción oficial', () => {
    const find = (level, form) =>
      loadOfficialWords(level).filter((term) => term.form === form);

    expect(find(1, '点').map((t) => t.sense_index)).toEqual([1]);
    expect(find(2, '点').map((t) => t.sense_index)).toEqual([2]);
    // La revisión publicada actualmente por la transcripción contiene 点1
    // también en HSK 3; el parser conserva ese byte tal cual, sin inventar una
    // excepción para forzarlo a la expectativa histórica del plan.
    expect(find(3, '点').map((t) => t.sense_index)).toEqual([1]);
  });

  it('reconoce dos acepciones del mismo término dentro de un nivel', () => {
    const hua = loadOfficialWords(2).filter((term) => term.form === '花');

    expect(hua.map((term) => term.sense_index)).toEqual([1, 2]);
  });

  it('fusiona líneas oficiales repetidas sin perder las que sí son sentidos distintos', () => {
    const result = dedupeOfficialTerms(loadOfficialWords(2), 2);
    const forms = result.terms.map((term) => `${term.form}#${term.sense_index ?? ''}`);

    expect(result.duplicates).toHaveLength(1);
    expect(forms.filter((key) => key === '过#')).toHaveLength(1);
    expect(forms.filter((key) => key.startsWith('花#'))).toHaveLength(2);
  });
});
