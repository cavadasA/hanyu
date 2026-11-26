import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearAllExamProgress,
  clearExamProgress,
  loadExamProgress,
  saveExamProgress,
  type ExamProgress,
} from './examProgressStore';

const progress = (overrides: Partial<ExamProgress> = {}): ExamProgress => ({
  level: 2,
  form_code: 'A',
  phase: 'reading',
  phase_start: Date.now() - 60_000,
  started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  picks: { 'a-l1': { 0: 2, 1: null }, 'a-w2': { 0: '好' } },
  ...overrides,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('examProgressStore', () => {
  it('devuelve lo guardado para el mismo usuario y la misma forma', async () => {
    const saved = progress();
    await saveExamProgress('u1', saved);
    await expect(loadExamProgress('u1', 2, 'A')).resolves.toEqual(saved);
  });

  it('no lo ofrece a otro usuario ni en otra forma', async () => {
    await saveExamProgress('u1', progress());
    await expect(loadExamProgress('u2', 2, 'A')).resolves.toBeNull();
    await expect(loadExamProgress('u1', 2, 'B')).resolves.toBeNull();
  });

  it('descarta un intento empezado hace más de un día', async () => {
    await saveExamProgress('u1', progress({ started_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString() }));
    await expect(loadExamProgress('u1', 2, 'A')).resolves.toBeNull();
  });

  it('descarta lo que no tiene forma de progreso', async () => {
    await saveExamProgress('u1', progress({ phase: 'result' as never }));
    await expect(loadExamProgress('u1', 2, 'A')).resolves.toBeNull();
  });

  it('clearExamProgress borra sólo esa forma', async () => {
    await saveExamProgress('u1', progress());
    await saveExamProgress('u1', progress({ form_code: 'B' }));
    await clearExamProgress('u1', 2, 'A');
    await expect(loadExamProgress('u1', 2, 'A')).resolves.toBeNull();
    await expect(loadExamProgress('u1', 2, 'B')).resolves.not.toBeNull();
  });

  it('clearAllExamProgress borra todos los simulacros a medias y nada más', async () => {
    await saveExamProgress('u1', progress());
    await saveExamProgress('u2', progress({ form_code: 'C' }));
    await AsyncStorage.setItem('hanyu.review-session', '{}');
    await clearAllExamProgress();
    await expect(loadExamProgress('u1', 2, 'A')).resolves.toBeNull();
    await expect(loadExamProgress('u2', 2, 'C')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('hanyu.review-session')).resolves.toBe('{}');
  });
});
