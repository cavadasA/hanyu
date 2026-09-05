import { render, screen, waitFor } from '@testing-library/react-native';
import type { LearningReport } from '@hanyu/data';
import { ProgressScreen } from './ProgressScreen';

const mockGetReport = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    stats: {
      getLearningReport: () => mockGetReport(),
    },
    settings: {
      getSettings: () => Promise.resolve({ request_retention: 0.9 }),
    },
  }),
}));

function reportWith(overrides: Partial<LearningReport> = {}): LearningReport {
  return {
    reviews: [],
    attempts: [],
    lookups: 0,
    reading_sessions: [],
    skill_states: [],
    reading_attempts: [],
    mistakes_count: 0,
    syllabus_words_count: 0,
    syllabus_word_ids: [],
    units: [],
    ...overrides,
  };
}

const now = new Date();
const manyReviews = Array.from({ length: 120 }, (_, index) => ({
  occurred_at: new Date(now.getTime() - (index % 6) * 86_400_000).toISOString(),
  grade: index < 110 ? '3' : '1',
  skill: 'recognition',
  phase_before: 'review',
}));

describe('ProgressScreen', () => {
  beforeEach(() => {
    mockGetReport.mockReset();
  });

  async function renderProgress() {
    return await render(<ProgressScreen />);
  }

  it('muestra la retención con su tamaño de muestra usando calificaciones numéricas', async () => {
    // Un 92 % sobre 5 repasos y sobre 500 no son lo mismo, y sin la muestra
    // no hay forma de saber cuál es. La base devuelve '3' y '1'.
    mockGetReport.mockResolvedValue(reportWith({ reviews: manyReviews }));

    await renderProgress();

    await waitFor(() => {
      expect(screen.getAllByText(/92 %/)[0]).toBeTruthy();
      expect(screen.getAllByText(/sobre 120 repasos/)[0]).toBeTruthy();
    });
  });

  it('dice que no hay muestra en vez de mostrar un cero', async () => {
    mockGetReport.mockResolvedValue(reportWith({ reviews: [] }));

    await renderProgress();

    await waitFor(() => {
      expect(screen.getAllByText(/Aún no hay repasos suficientes/)[0]).toBeTruthy();
    });
    expect(screen.queryByText('0 %')).toBeNull();
  });

  it('explica por qué la comprensión inferencial está vacía', async () => {
    // El validador del Plan 7 exige evidencia textual en toda pregunta, así que
    // todas son literales por construcción. Callarlo daría a entender que el
    // usuario falla en algo que nadie le ha preguntado.
    mockGetReport.mockResolvedValue(reportWith({}));

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText(/todas las preguntas del catálogo son literales/i)).toBeTruthy();
    });
  });

  it('desglosa el vocabulario demostrado por habilidad', async () => {
    mockGetReport.mockResolvedValue(
      reportWith({
        skill_states: [
          { target_id: 1, skill: 'recognition', stability: 200, suspended: false, last_reviewed_at: '2026-09-01T00:00:00Z' },
          { target_id: 2, skill: 'listening', stability: 150, suspended: false, last_reviewed_at: '2026-09-02T00:00:00Z' },
        ],
      }),
    );

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText('Reconocimiento')).toBeTruthy();
      expect(screen.getByText('Escucha')).toBeTruthy();
    });
  });

  it('muestra ErrorBanner y botón de reintentar si la carga falla, sin tarjetas vacías', async () => {
    mockGetReport.mockRejectedValue(new Error('Error de prueba'));

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText('Error de prueba')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    });
    expect(screen.queryByText(/Aún no hay repasos suficientes/)).toBeNull();
    expect(screen.queryByText('Memoria y retención')).toBeNull();
  });

  it('calcula comprensión literal a partir de reading_attempts', async () => {
    mockGetReport.mockResolvedValue(
      reportWith({
        reading_attempts: [
          { created_at: '2026-09-01T00:00:00Z', reading_slug: 'text-1', score: 4, total: 5 },
        ],
      }),
    );

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText(/80 %/)).toBeTruthy();
      expect(screen.getByText(/\(4 de 5 preguntas acertadas\)/)).toBeTruthy();
    });
  });

  it('calcula velocidad y consultas con caracteres reales sin inventar valores', async () => {
    mockGetReport.mockResolvedValue(
      reportWith({
        reading_sessions: [
          { slug: 'text-1', seconds: 60, pinyin_shown: false, chars: 180 },
        ],
        lookups: 3,
      }),
    );

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText('180 car./min')).toBeTruthy();
      expect(screen.getByText(/1\.7 consultas \/ 100 car\./)).toBeTruthy();
    });
  });

  it('muestra cobertura del sílabo, unidades y métricas de evaluación', async () => {
    mockGetReport.mockResolvedValue(
      reportWith({
        syllabus_words_count: 2,
        syllabus_word_ids: [1, 2],
        skill_states: [
          { target_id: 1, skill: 'recognition', stability: 200, suspended: false, last_reviewed_at: '2026-09-01T00:00:00Z', in_scope: true },
        ],
        units: [
          { code: 'U1', title: 'Unidad 1', hsk_level: 1, total_words: 10, settled_words: 10, total_items: 10, settled_items: 10, completed: true },
          { code: 'U2', title: 'Unidad 2', hsk_level: 1, total_words: 10, settled_words: 5, total_items: 10, settled_items: 5, completed: false },
        ],
        attempts: [
          { occurred_at: '2026-09-01T00:00:00Z', skill: 'listening', correct: true, mode: 'practice' },
          { occurred_at: '2026-09-01T00:00:00Z', skill: 'production', correct: false, mode: 'practice' },
          { occurred_at: '2026-09-01T00:00:00Z', skill: 'reading', correct: true, mode: 'exam' },
        ],
        mistakes_count: 5,
      }),
    );

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText(/\(1 de 2 palabras del catálogo en este nivel\)/)).toBeTruthy();
      expect(screen.getByText(/1 de 2 unidades/)).toBeTruthy();
      expect(screen.getByText('Precisión de dictado')).toBeTruthy();
      expect(screen.getByText('Precisión de producción')).toBeTruthy();
      expect(screen.getByText('Rendimiento en simulacros')).toBeTruthy();
      expect(screen.getByText(/5 errores en cola de consolidación/)).toBeTruthy();
    });
  });
});
