import { planExpressionSession } from './plan-session';

const writing = [{ hanzi: '学' }, { hanzi: '生' }];
const pronunciation = [{ hanzi: '你好' }, { hanzi: '谢谢' }];
const tasks = [{ slug: '2-01-a' }, { slug: '2-02-b' }];

const base = {
  mode: 'learn' as const,
  pronunciationAvailable: true,
  communicativeAvailable: true,
  writing,
  pronunciation,
  communicative: tasks,
};

describe('planExpressionSession', () => {
  it('con la pronunciación no disponible en el dispositivo, no incluye ningún ejercicio de pronunciación', () => {
    const plan = planExpressionSession({ ...base, pronunciationAvailable: false });

    expect(plan.some(item => item.kind === 'pronunciation')).toBe(false);
    expect(plan.filter(item => item.kind === 'writing')).toHaveLength(2);
  });

  it('un carácter con escritura vencida aparece como CharacterWriting en quiz', () => {
    const plan = planExpressionSession({ ...base, writing: [{ hanzi: '学' }] });

    expect(plan).toContainEqual({ kind: 'writing', mode: 'quiz', item: { hanzi: '学' } });
  });

  it('una tarea comunicativa como mucho por sesión de Learn, al final', () => {
    const plan = planExpressionSession(base);

    expect(plan.filter(item => item.kind === 'communicative')).toEqual([{ kind: 'communicative', task: tasks[0] }]);
    expect(plan.at(-1)?.kind).toBe('communicative');
  });

  it('fuera de Learn no hay tareas comunicativas; sin corrector tampoco', () => {
    expect(planExpressionSession({ ...base, mode: 'review' }).some(item => item.kind === 'communicative')).toBe(false);
    expect(planExpressionSession({ ...base, communicativeAvailable: false }).some(item => item.kind === 'communicative')).toBe(false);
  });

  it('el modo Exam no incluye ejercicios de práctica de ninguno de los tres', () => {
    expect(planExpressionSession({ ...base, mode: 'exam' })).toEqual([]);
  });

  it('alterna escritura y pronunciación', () => {
    const plan = planExpressionSession({ ...base, communicativeAvailable: false });

    expect(plan.map(item => item.kind)).toEqual(['writing', 'pronunciation', 'writing', 'pronunciation']);
  });
});
