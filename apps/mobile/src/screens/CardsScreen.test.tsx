import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  buildResponderGrantEvent,
  buildResponderReleaseEvent,
} from '@testing-library/react-native/dist/event-builder';
import CardsScreen from './CardsScreen';
import { applyReview, emptyState, schedulingParams, MAX_SESSION_SHOWINGS } from '@hanyu/domain';
import {
  clearReviewSession,
  loadReviewSession,
  saveReviewSession,
} from '../lib/reviewSessionStore';

const mockGetDueCards = jest.fn();
const mockReviewCard = jest.fn();
const mockRateCard = jest.fn();
const mockUndoRating = jest.fn();
const mockLoadQueue = jest.fn();
const mockLogTime = jest.fn();
const mockGetDashboard = jest.fn();
const mockRecordEvent = jest.fn();
const mockPush = jest.fn();
const mockPreviewIntervals = jest.fn((..._args: unknown[]) => ({
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
}));
let mockRequestRetention = 0.9;
const mockOfflineService = {
  loadQueue: (skill?: string, deckId?: string | null, mode?: string) =>
    mode && mode !== 'review'
      ? mockLoadQueue(skill ?? 'recognition', deckId, mode)
      : mockLoadQueue(skill ?? 'recognition', deckId),
  lastDeckSize: null as number | null,
  lastQueueError: null as string | null,
  rateCard: (card: unknown, grade: string, timeMs: number | null) =>
    mockRateCard(card, grade, timeMs),
  undoRating: (reviewId: string) => mockUndoRating(reviewId),
};

jest.mock('@hanyu/domain', () => {
  const actual = jest.requireActual('@hanyu/domain');
  return {
    ...actual,
    previewIntervals: (...args: unknown[]) => mockPreviewIntervals(...args),
  };
});

jest.mock('../lib/data', () => ({
  getData: () => ({
    stats: {
      logTime: (ms: number) => mockLogTime(ms),
      getDashboard: () => mockGetDashboard(),
    },
    events: { recordEvent: (input: unknown) => mockRecordEvent(input) },
  }),
}));

jest.mock('../offline/OfflineReviewProvider', () => ({
  useOfflineReview: () => ({
    service: mockOfflineService,
    ready: true,
    requestRetention: mockRequestRetention,
    pendingCount: 0,
    refreshPendingCount: jest.fn(),
    sync: jest.fn().mockResolvedValue(null),
    syncing: false,
    lastSummary: null,
  }),
}));

let mockSearchParams: Record<string, string> = { deckId: 'd1' };
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
    useRouter: () => ({ push: mockPush }),
    useLocalSearchParams: () => mockSearchParams,
  };
});

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-session' }));

function card(id: string, hanzi: string) {
  return {
    id,
    user_id: 'user-test',
    word_id: id === 'c1' ? 1 : 2,
    skill: 'recognition' as const,
    hanzi,
    pinyin: 'nǐ hǎo',
    meaning_en: 'hello',
    hsk_level: 1,
    scheduling: emptyState(new Date('2099-01-01T00:00:00.000Z')),
    version: 1,
  };
}

function responderGrantEvent() {
  return {
    ...buildResponderGrantEvent(),
    touchHistory: {
      mostRecentTimeStamp: 0,
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      touchBank: [
        {
          touchActive: true,
          startPageX: 0,
          startPageY: 0,
          startTimeStamp: 0,
          currentPageX: 0,
          currentPageY: 0,
          currentTimeStamp: 0,
          previousPageX: 0,
          previousPageY: 0,
          previousTimeStamp: 0,
        },
      ],
    },
  };
}

async function renderCards() {
  await act(async () => {
    await render(<CardsScreen />);
  });
}

describe('CardsScreen', () => {
  beforeEach(async () => {
    await clearReviewSession();
    mockOfflineService.lastDeckSize = 150;
    mockOfflineService.lastQueueError = null;
    mockGetDueCards.mockReset();
    mockReviewCard.mockReset();
    mockRateCard.mockReset();
    mockUndoRating.mockReset();
    mockLoadQueue.mockReset();
    mockLogTime.mockReset();
    mockRecordEvent.mockReset();
    mockPush.mockReset();
    mockPreviewIntervals.mockReset().mockReturnValue({ again: 1, hard: 2, good: 3, easy: 4 });
    mockRequestRetention = 0.9;
    mockSearchParams = { deckId: 'd1' };
    mockGetDashboard.mockReset().mockResolvedValue({
      cards: { total: 150, due: 2, by_status: { new: 100, learning: 30, review: 20 } },
    });
  });

  afterEach(async () => {
    await clearReviewSession();
  });

  it('renders pre-session view with Reviews heading and Start review button', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);

    await renderCards();

    expect(screen.getByText('Repasos')).toBeTruthy();
    expect(screen.getByText('Empezar sesión')).toBeTruthy();
  });

  it('reveals the answer and advances to the next card after rating during active review', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();

    // Start session
    await fireEvent.press(screen.getByText('Empezar sesión'));

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();

    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    expect(screen.getByText('hello')).toBeTruthy();

    await fireEvent.press(screen.getByText('Bien'));

    expect(screen.getByText('谢谢')).toBeTruthy();
    expect(mockRateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'good', expect.any(Number));
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('logs study time and shows summary stats when the session ends', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockLogTime.mockResolvedValue(undefined);

    await renderCards();

    await fireEvent.press(screen.getByText('Empezar sesión'));
    expect(screen.getByText('你好')).toBeTruthy();

    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Fácil'));

    expect(screen.getByText('Sesión completada')).toBeTruthy();
    expect(screen.getByText(/Has repasado 1 tarjeta/)).toBeTruthy();
    expect(screen.getByText('Aciertos')).toBeTruthy();
    expect(mockLogTime).toHaveBeenCalledTimes(1);
  });

  it('rates through the offline service and never through the repository', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();

    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));

    expect(mockRateCard).toHaveBeenCalledTimes(1);
    expect(mockReviewCard).not.toHaveBeenCalled();
  });

  it('undoes the rating that was actually written', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockResolvedValue(card('c1', '你好'));

    await renderCards();

    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));

    expect(screen.getByText('谢谢')).toBeTruthy();

    // Press undo button
    const undoButton = screen.getByLabelText('Deshacer la última calificación');
    await fireEvent.press(undoButton);

    expect(mockUndoRating).toHaveBeenCalledWith('r1');
    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('does not roll back the screen when the undo fails', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockRejectedValue(new Error('This rating was already synced'));

    await renderCards();

    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));
    await fireEvent.press(screen.getByLabelText('Deshacer la última calificación'));

    expect(screen.getByText('This rating was already synced')).toBeTruthy();
    expect(screen.getByText('谢谢')).toBeTruthy();
  });

  it('does not open the diagnostic for an explicitly focused empty deck', async () => {
    mockOfflineService.lastDeckSize = 0;
    mockGetDashboard.mockResolvedValueOnce({ cards: { total: 0, due: 0, by_status: {} } });
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();

    expect(screen.queryByText('Set up your HSK2 study plan')).toBeNull();
    expect(screen.getByText('No hay tarjetas pendientes')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalledWith('/diagnostic');
  });

  it('shows no cards due state when deck exists but no cards are due', async () => {
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();

    expect(screen.getByText('No hay tarjetas pendientes')).toBeTruthy();
  });

  it('no pide un número fijo de tarjetas: la cola la decide el servidor', async () => {
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();

    expect(mockLoadQueue).toHaveBeenCalledWith('recognition', 'd1');
    expect(JSON.stringify(mockLoadQueue.mock.calls)).not.toContain('50');
  });

  it('pide la cola de la habilidad seleccionada', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);

    await renderCards();
    await fireEvent.press(screen.getByRole('button', { name: 'Recordar' }));

    await waitFor(() => expect(mockLoadQueue).toHaveBeenLastCalledWith('recall', 'd1'));
  });

  it('recalcula el preview cuando cambia la retención del proveedor', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);

    const view = await act(async () => render(<CardsScreen />));
    await fireEvent.press(screen.getByText('Empezar sesión'));

    expect(mockPreviewIntervals).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(Date),
      expect.objectContaining({ request_retention: 0.9 }),
    );

    mockRequestRetention = 0.95;
    await view.rerender(<CardsScreen />);

    expect(mockPreviewIntervals).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(Date),
      expect.objectContaining({ request_retention: 0.95 }),
    );
  });

  it('en recuerdo pide escribir la respuesta y no revelar la tarjeta', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();
    await fireEvent.press(screen.getByRole('button', { name: 'Recordar' }));
    await waitFor(() => expect(mockLoadQueue).toHaveBeenLastCalledWith('recall', 'd1'));
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar sesión' }));

    expect(screen.getByPlaceholderText('Escribe la respuesta')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mostrar respuesta' })).toBeNull();

    await fireEvent.changeText(screen.getByPlaceholderText('Escribe la respuesta'), '你好');
    await fireEvent.press(screen.getByRole('button', { name: 'Comprobar' }));

    expect(mockRateCard).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(mockRateCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      expect.any(String),
      expect.any(Number),
    ));
  });

  it('shows a back to deck action on the completion screen in focus mode', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();
    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));

    expect(screen.getByText('Volver al mazo')).toBeTruthy();
  });

  it('vuelve a presentar dentro de la sesión una tarjeta fallada', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockImplementation(async (input: any, grade: any) => ({
      card: {
        ...input,
        scheduling: applyReview(input.scheduling, grade, new Date(), schedulingParams({})).state,
      },
      reviewId: `r-${grade}`,
    }));

    await renderCards();
    await fireEvent.press(screen.getByText('Empezar sesión'));

    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Otra vez'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));

    expect(screen.queryByText('Sesión completada')).toBeNull();
    expect(screen.getByText('你好')).toBeTruthy();
  });

  it('deja de reencolar una tarjeta al llegar al tope de pases de la sesión', async () => {
    // Hard sobre una tarjeta en learning es un punto fijo de FSRS: devuelve
    // siempre el mismo paso. Sin tope la sesión no terminaría nunca.
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockImplementation(async (input: any, grade: any) => ({
      card: {
        ...input,
        scheduling: applyReview(input.scheduling, grade, new Date(), schedulingParams({})).state,
      },
      reviewId: `r-${grade}`,
    }));

    await renderCards();
    await fireEvent.press(screen.getByText('Empezar sesión'));

    for (let pass = 0; pass < MAX_SESSION_SHOWINGS; pass += 1) {
      await fireEvent.press(screen.getByText('Mostrar respuesta'));
      await fireEvent.press(screen.getByText('Difícil'));
    }

    expect(screen.getByText('Sesión completada')).toBeTruthy();
    expect(mockRateCard).toHaveBeenCalledTimes(MAX_SESSION_SHOWINGS);
  });

  it('reanuda en la siguiente tarjeta guardada aunque las anteriores ya no estén vencidas', async () => {
    const currentCards = Array.from({ length: 5 }, (_, offset) =>
      card(`c${offset + 5}`, `word-${offset + 5}`),
    );
    mockLoadQueue.mockResolvedValue(currentCards);
    await saveReviewSession({
      session_id: 'saved-session',
      deck_id: 'd1',
      card_ids: Array.from({ length: 10 }, (_, index) => `c${index}`),
      index: 5,
      mode: 'recognition',
      started_at: Date.now(),
      reviewed: 5,
      stats: { reviewed: 5, correct: 4, again: 1 },
    });

    await renderCards();
    await fireEvent.press(screen.getByText('Continuar'));

    expect(screen.getByText('word-5')).toBeTruthy();
    expect(screen.getByText('1/5')).toBeTruthy();
  });

  it('removes a requeued Again card when Undo returns to it', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockImplementation(async (input: any, grade: any) => ({
      card: {
        ...input,
        scheduling: applyReview(input.scheduling, grade, new Date(), schedulingParams({})).state,
      },
      reviewId: `r-${grade}`,
    }));
    mockUndoRating.mockResolvedValue(card('c1', '你好'));

    await renderCards();
    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Otra vez'));

    expect(screen.getByText('2/3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Deshacer la última calificación'));

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('persists the rewound position after a successful Undo', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockResolvedValue(card('c1', '你好'));

    await renderCards();
    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));
    await fireEvent.press(screen.getByLabelText('Deshacer la última calificación'));

    await waitFor(async () => {
      await expect(loadReviewSession()).resolves.toMatchObject({
        index: 0,
        reviewed: 0,
        card_ids: ['c1', 'c2'],
        stats: { reviewed: 0, correct: 0, again: 0 },
      });
    });
  });

  it('discards the resumable session from the CardsScreen banner', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    await saveReviewSession({
      session_id: 'discard-me',
      deck_id: 'd1',
      card_ids: ['c1'],
      index: 0,
      mode: 'recognition',
      started_at: Date.now(),
      reviewed: 0,
      stats: { reviewed: 0, correct: 0, again: 0 },
    });

    await renderCards();
    await fireEvent.press(screen.getByText('Descartar'));

    expect(screen.queryByText('Continuar')).toBeNull();
    await expect(loadReviewSession()).resolves.toBeNull();
  });

  // «Start learning» en Hoy abría Reviews en modo Review.
  it('abre en el modo que pide la ruta', async () => {
    mockSearchParams = { deckId: 'd1', mode: 'learn', at: '1' };
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();

    expect(mockLoadQueue).toHaveBeenLastCalledWith('recognition', 'd1', 'learn');
  });

  // Tras una sesión, «Deck breakdown» y «N due» seguían con los números de antes.
  it('al cerrar una sesión vuelve a pedir la cola y los contadores', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    await renderCards();
    await fireEvent.press(screen.getByText('Empezar sesión'));
    const queues = mockLoadQueue.mock.calls.length;
    const dashboards = mockGetDashboard.mock.calls.length;

    await fireEvent.press(screen.getByLabelText('Cerrar la sesión de repaso'));

    await waitFor(() => expect(mockLoadQueue.mock.calls.length).toBeGreaterThan(queues));
    expect(mockGetDashboard.mock.calls.length).toBeGreaterThan(dashboards);
  });

  it('en modo Learn solo entran elementos nuevos', async () => {
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();
    await fireEvent.press(screen.getByText('Aprender'));

    expect(mockLoadQueue).toHaveBeenLastCalledWith('recognition', 'd1', 'learn');
  });

  it('muestra cuando la cola específica del modo no pudo cargarse', async () => {
    mockLoadQueue.mockResolvedValue([]);
    mockOfflineService.lastQueueError = 'active unit failed';

    await renderCards();

    expect(screen.getByText('active unit failed')).toBeTruthy();
  });

  it('en modo Learn avanzar introduce la tarjeta y crea una programación FSRS', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();
    await fireEvent.press(screen.getByText('Aprender'));
    await waitFor(() => expect(mockLoadQueue).toHaveBeenLastCalledWith('recognition', 'd1', 'learn'));
    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));

    expect(mockRateCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      'good',
      expect.any(Number),
    );
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('en modo Exam no se ofrecen pistas', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);

    await renderCards();
    await fireEvent.press(screen.getByText('Examen'));
    await fireEvent.press(screen.getByText('Empezar sesión'));

    expect(screen.queryByText('Ver una pista')).toBeNull();
  });

  it('en modo Exam la valoración se registra pero no reprograma', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);

    await renderCards();
    await fireEvent.press(screen.getByText('Examen'));
    await fireEvent.press(screen.getByText('Empezar sesión'));
    await fireEvent.press(screen.getByText('Mostrar respuesta'));
    await fireEvent.press(screen.getByText('Bien'));

    expect(mockRateCard).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'exercise_attempted' }),
    );
  });

  it('muestra descripciones contextuales para modo de estudio y habilidad seleccionados', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);

    await renderCards();

    // Default: review mode + recognition skill
    expect(screen.getByText('Repasa lo pendiente con repetición espaciada (FSRS)')).toBeTruthy();
    expect(screen.getByText('Entender: hanzi → significado y pinyin')).toBeTruthy();

    // Change to Learn mode
    await fireEvent.press(screen.getByText('Aprender'));
    expect(screen.getByText('Presenta palabras nuevas con audio, pinyin y guía de trazos')).toBeTruthy();

    // Change to Recall skill
    await fireEvent.press(screen.getByRole('button', { name: 'Recordar' }));
    expect(screen.getByText('Recordar: significado → escribe hanzi y pinyin')).toBeTruthy();

    // Change to Exam mode
    await fireEvent.press(screen.getByText('Examen'));
    expect(screen.getByText('Evaluación con tiempo y sin pistas para medir lo que recuerdas')).toBeTruthy();

    // Change to Listening skill
    await fireEvent.press(screen.getByRole('button', { name: 'Escuchar' }));
    expect(screen.getByText('Escuchar: audio → identifica el hanzi')).toBeTruthy();
  });
});
