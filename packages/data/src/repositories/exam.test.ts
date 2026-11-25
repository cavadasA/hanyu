import { describe, expect, it, vi } from 'vitest';
import { answersByIndex, getExamForm, listExamAttempts, submitExamAttempt } from './exam';

function client(rpcResult: unknown = null, tableResult: unknown = []) {
  const chain: Record<string, any> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tableResult, error: null }).then(resolve),
  };
  for (const method of ['select', 'eq', 'order']) chain[method] = vi.fn(() => chain);
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
    from: vi.fn(() => chain),
    chain,
  } as any;
}

const form = {
  level: 2,
  code: 'A',
  content: {
    code: 'A',
    level: 2,
    groups: [
      { slug: 'a-r1', part: 'R1', images: [], items: [{ text: { zh: '一', pinyin: 'yī' } }, { text: { zh: '二', pinyin: 'èr' } }, { text: { zh: '三', pinyin: 'sān' } }] },
      { slug: 'a-w2', part: 'W2', items: [{ sentence: { zh: '（ ）', pinyin: 'x' } }] },
    ],
  },
  timeline: [],
  media: { audio: {}, images: {}, characters: {} },
  repeated: false,
};

describe('getExamForm', () => {
  it('pide la forma al servidor y la devuelve tal cual, o null si no hay ninguna', async () => {
    const withForm = client(form);
    await expect(getExamForm(2, null, withForm)).resolves.toEqual(form);
    expect(withForm.rpc).toHaveBeenCalledWith('get_exam_form', { p_level: 2, p_form: null });
    await expect(getExamForm(2, 'B', client(null))).resolves.toBeNull();
  });
});

describe('answersByIndex', () => {
  it('da un array por grupo, con null en las preguntas sin responder', () => {
    expect(answersByIndex(form as any, { 'a-r1': { 1: 4 }, 'a-w2': { 0: '学' } })).toEqual({
      'a-r1': [null, 4, null],
      'a-w2': ['学'],
    });
  });

  it('un grupo sin ninguna respuesta también va, entero a null', () => {
    expect(answersByIndex(form as any, {})).toEqual({ 'a-r1': [null, null, null], 'a-w2': [null] });
  });
});

describe('submitExamAttempt', () => {
  it('envía las respuestas por índice de pregunta y devuelve el intento corregido en servidor', async () => {
    const graded = { id: 'x', total_percent: 50 };
    const c = client(graded);
    const attempt = {
      level: 2,
      form_code: 'A',
      scope: 'full' as const,
      started_at: '2026-11-25T10:00:00.000Z',
      answers: { 'a-r1': [null, 4, null], 'a-w2': ['学'] },
    };
    await expect(submitExamAttempt(attempt, c)).resolves.toEqual(graded);
    expect(c.rpc).toHaveBeenCalledWith('submit_exam_attempt', { p_attempt: { ...attempt, part_code: null } });
  });
});

describe('listExamAttempts', () => {
  it('lee los intentos del nivel en orden cronológico', async () => {
    const c = client(null, [{ id: '1' }]);
    await expect(listExamAttempts(2, c)).resolves.toEqual([{ id: '1' }]);
    expect(c.from).toHaveBeenCalledWith('exam_attempt');
    expect(c.chain.eq).toHaveBeenCalledWith('level', 2);
    expect(c.chain.order).toHaveBeenCalledWith('finished_at', { ascending: true });
  });
});
