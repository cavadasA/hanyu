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
    ...overrides,
  };
}

const now = new Date();
const manyReviews = Array.from({ length: 120 }, (_, index) => ({
  occurred_at: new Date(now.getTime() - (index % 6) * 86_400_000).toISOString(),
  grade: index < 110 ? 'good' : 'again',
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

  it('muestra la retención con su tamaño de muestra', async () => {
    // Un 92 % sobre 5 repasos y sobre 500 no son lo mismo, y sin la muestra
    // no hay forma de saber cuál es.
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
});
