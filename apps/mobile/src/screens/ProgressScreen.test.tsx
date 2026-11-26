import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { LearningReport } from '@hanyu/data';
import { ProgressScreen } from './ProgressScreen';

const mockGetReport = jest.fn();

const mockListExamAttempts = jest.fn(async (_level: number): Promise<unknown[]> => []);
jest.mock('../lib/data', () => ({
  getData: () => ({
    stats: {
      getLearningReport: () => mockGetReport(),
    },
    exam: { listExamAttempts: (level: number) => mockListExamAttempts(level) },
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

  it('sin respuestas suficientes, la comprensión literal e inferencial dicen «Sin datos todavía», nunca 0 %', async () => {
    mockGetReport.mockResolvedValue(reportWith({}));

    await renderProgress();

    await waitFor(() => {
      expect(screen.getAllByText('Sin datos todavía')).toHaveLength(2);
    });
    expect(screen.queryByText(/todas las preguntas del catálogo son literales/i)).toBeNull();
    expect(screen.queryByText(/^0 %/)).toBeNull();
  });

  // Con respuestas, pero menos de las necesarias, decía «Sin datos todavía».
  it('con respuestas pero sin las suficientes, dice cuántas faltan', async () => {
    const attempts: LearningReport['reading_attempts'] = [
      { created_at: '2026-11-01T00:00:00Z', reading_slug: 'text-1', score: 3, total: 4, inferential_score: 1, inferential_total: 1 },
    ];
    mockGetReport.mockResolvedValue(reportWith({ reading_attempts: attempts }));

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText('Faltan 2 respuestas para calcularla')).toBeTruthy();
      expect(screen.getByText('Faltan 4 respuestas para calcularla')).toBeTruthy();
    });
    expect(screen.queryByText('Sin datos todavía')).toBeNull();
  });

  // «Estabilidad ≥ 30 d y retención activa» se cortaba por la derecha.
  it('las cabeceras de sección dejan bajar la etiqueta a otra línea', async () => {
    mockGetReport.mockResolvedValue(reportWith({}));
    await renderProgress();

    const badge = await screen.findByText('Estabilidad ≥ 30 d y retención activa');
    let node: any = badge.parent;
    while (node && !(node.props?.testID === 'section-header')) node = node.parent;
    expect(node).toBeTruthy();
    expect(StyleSheet.flatten(node.props.style)).toMatchObject({ flexWrap: 'wrap' });
  });

  it('separa la comprensión inferencial de la literal', async () => {
    const attempts: LearningReport['reading_attempts'] = [
      { created_at: '2026-11-01T00:00:00Z', reading_slug: 'text-1', score: 5, total: 6, inferential_score: 2, inferential_total: 3 },
      { created_at: '2026-11-02T00:00:00Z', reading_slug: 'text-2', score: 3, total: 6, inferential_score: 1, inferential_total: 3 },
    ];
    mockGetReport.mockResolvedValue(reportWith({ reading_attempts: attempts }));

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText(/\(3 de 6 preguntas acertadas\)/)).toBeTruthy();
      expect(screen.getByText(/\(5 de 6 preguntas acertadas\)/)).toBeTruthy();
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

  it('desglosa también pronunciación y escritura, y la escritura cuenta caracteres', async () => {
    mockGetReport.mockResolvedValue(
      reportWith({
        skill_states: [
          { target_id: 23398, skill: 'writing', stability: 200, suspended: false, last_reviewed_at: '2026-09-01T00:00:00Z' },
          { target_id: 3, skill: 'pronunciation', stability: 200, suspended: false, last_reviewed_at: '2026-09-02T00:00:00Z' },
        ],
      }),
    );

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText('Pronunciación')).toBeTruthy();
      expect(screen.getByText('Escritura')).toBeTruthy();
      expect(screen.getByText('1 caracteres')).toBeTruthy();
      expect(screen.getByText('1 palabras')).toBeTruthy();
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

  it('muestra ErrorBanner y reintentar si el reporte viene vacío o no genera métricas en lugar de pantalla en blanco', async () => {
    mockGetReport.mockResolvedValue(null);

    await renderProgress();

    await waitFor(() => {
      expect(screen.getByText('No se pudieron cargar los datos de progreso.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    });
    expect(screen.queryByText('Progreso real')).toBeNull();
  });

  it('calcula comprensión literal a partir de reading_attempts', async () => {
    mockGetReport.mockResolvedValue(
      reportWith({
        reading_attempts: [
          { created_at: '2026-09-01T00:00:00Z', reading_slug: 'text-1', score: 4, total: 5, inferential_score: 0, inferential_total: 0 },
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

  // Arriba decía «Último simulacro: 92 %» y abajo «Aún no has realizado simulacros»: la fila
  // contaba los ejercicios del simulacro antiguo, retirado en el Plan 12.
  it('el rendimiento en simulacros sale de los simulacros completos de verdad', async () => {
    const full = (total_percent: number) => ({ scope: 'full', total_percent, repeated: false, part_scores: {}, section_scores: {} });
    mockListExamAttempts.mockResolvedValueOnce([full(80), full(92), { ...full(50), scope: 'part' }]);
    mockGetReport.mockResolvedValue(reportWith({}));

    await renderProgress();

    await waitFor(() => expect(screen.getByText(/86 %/)).toBeTruthy());
    expect(screen.getByText(/media de 2 simulacros completos/)).toBeTruthy();
    expect(screen.queryByText('Aún no has realizado simulacros de examen.')).toBeNull();
    expect(mockListExamAttempts).toHaveBeenCalledWith(2);
  });
});
