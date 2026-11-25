import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ExamRunner } from './ExamRunner';
import { ExamResult } from './ExamResult';

const mockGetExamForm = jest.fn();
const mockSubmit = jest.fn();
const mockRateCard = jest.fn();
const mockReview = jest.fn();
let mockDownload = { progress: 1, ready: true, failed: false, localUri: (url: string) => `file:///${url}`, retry: jest.fn() };

jest.mock('../lib/data', () => ({
  getData: () => ({
    exam: { getExamForm: (...args: unknown[]) => mockGetExamForm(...args), submitExamAttempt: (...args: unknown[]) => mockSubmit(...args) },
    flashcards: { rateCard: (...args: unknown[]) => mockRateCard(...args), reviewCardEvent: (...args: unknown[]) => mockReview(...args) },
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('./useExamDownload', () => ({ useExamDownload: () => mockDownload }));
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: { surface: '#fff', text: '#111', textMuted: '#666', border: '#ddd', vermilion: '#c93624', onAccent: '#fff', background: '#fafafa' } }),
}));
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: () => <View /> };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const p = (zh: string) => ({ zh, pinyin: `${zh}-py` });
const timeline = [
  { at_ms: 0, kind: 'instruction', part: 'L1', question_index: -1, clip: 'opening', play: 1 },
  ...[0, 1, 2].map(index => ({ at_ms: 10_000 + index * 10_000, kind: 'item', part: 'L1', question_index: index, clip: `L1-q0${index + 1}`, play: 1 })),
];
const form = {
  level: 2,
  code: 'A',
  repeated: false,
  content: {
    code: 'A',
    level: 2,
    groups: [
      { slug: 'a-l1', part: 'L1', items: [0, 1, 2].map(index => ({ audio: [], images: [`i${index}a`, `i${index}b`, `i${index}c`] })) },
      { slug: 'a-r4', part: 'R4', items: [{ passage: p('我在家。'), question: p('★ 他在：'), options: [p('家'), p('学校'), p('商店')] }] },
      { slug: 'a-w2', part: 'W2', items: [{ sentence: p('我是（ ）生。') }] },
    ],
  },
  timeline,
  media: {
    audio: Object.fromEntries(timeline.map(entry => [entry.clip, { url: `${entry.clip}.m4a`, duration_ms: 5000, path: '' }])),
    images: {},
    characters: {},
  },
};

beforeEach(() => {
  jest.useFakeTimers();
  mockGetExamForm.mockReset().mockResolvedValue(form);
  mockSubmit.mockReset().mockResolvedValue({
    id: 'x', level: 2, form_code: 'A', scope: 'full', part_code: null, started_at: '', finished_at: '', answers: {},
    section_scores: { listening: { correct: 1, total: 3, percent: 33 }, reading: { correct: 0, total: 1, percent: 0 }, writing: { correct: 0, total: 1, percent: 0 } },
    part_scores: { L1: { correct: 1, total: 3, percent: 33 }, R4: { correct: 0, total: 1, percent: 0 }, W2: { correct: 0, total: 1, percent: 0 } },
    total_percent: 20, repeated: false,
  });
  mockRateCard.mockReset();
  mockReview.mockReset();
  mockDownload = { progress: 1, ready: true, failed: false, localUri: (url: string) => `file:///${url}`, retry: jest.fn() };
});
afterEach(() => {
  jest.useRealTimers();
});

async function start() {
  await render(<ExamRunner formCode={null} />);
  await waitFor(() => expect(screen.getByLabelText('Empezar')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Empezar'));
}

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('ExamRunner', () => {
  it('con la descarga al 60 % «Empezar» está deshabilitado', async () => {
    mockDownload = { ...mockDownload, progress: 0.6, ready: false };
    await render(<ExamRunner formCode={null} />);
    await waitFor(() => expect(screen.getByLabelText('Empezar')).toBeTruthy());
    expect(screen.getByLabelText('Empezar')).toBeDisabled();
    expect(screen.getByText(/60 %/)).toBeTruthy();
  });

  it('en L1, al llegar el reloj al at_ms de la pregunta 3 se activa sin ningún toque', async () => {
    await start();
    expect(screen.getByText('Ahora: instrucciones')).toBeTruthy();
    await advance(30_000);
    expect(screen.getByText('Ahora: pregunta 3')).toBeTruthy();
  });

  it('no hay botón «Pausar» en 听力', async () => {
    await start();
    expect(screen.queryByLabelText('Pausar')).toBeNull();
  });

  it('agotar los 10 minutos de 书写 entrega con las no respondidas como null', async () => {
    await start();
    await advance(35_000); // fin de 听力
    await advance(3 * 60_000); // hoja de respuestas
    await advance(25 * 60_000); // 阅读
    await advance(10 * 60_000); // 书写
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit.mock.calls[0][0]).toMatchObject({
      level: 2,
      form_code: 'A',
      scope: 'full',
      answers: { 'a-l1': [null, null, null], 'a-r4': [null], 'a-w2': [null] },
    });
  });

  it('durante el examen no se reprograma ninguna tarjeta', async () => {
    await start();
    await fireEvent.press(screen.getByLabelText('Pregunta 1, imagen B'));
    await advance(35_000 + (3 + 25 + 10) * 60_000);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit.mock.calls[0][0].answers['a-l1']).toEqual([1, null, null]);
    expect(mockRateCard).not.toHaveBeenCalled();
    expect(mockReview).not.toHaveBeenCalled();
  });
});

describe('ExamResult', () => {
  const attempt: any = {
    section_scores: { listening: { correct: 20, total: 25, percent: 80 }, reading: { correct: 15, total: 25, percent: 60 }, writing: { correct: 5, total: 10, percent: 50 } },
    part_scores: { L1: { correct: 5, total: 5, percent: 100 }, W2: { correct: 1, total: 5, percent: 20 } },
    total_percent: 67,
    repeated: false,
  };

  it('sin escala oficial da porcentajes, la parte más floja y ningún «aprobado»', async () => {
    await render(<ExamResult attempt={attempt} onClose={jest.fn()} />);
    expect(screen.getByText('67 %')).toBeTruthy();
    expect(screen.getByText(/80 %/)).toBeTruthy();
    expect(screen.getByText(/El HSK 3.0 aún no ha publicado su escala de puntuación/)).toBeTruthy();
    expect(screen.getByText('La parte que más te arrastra: 书写 2')).toBeTruthy();
    expect(screen.queryByText(/aprobado/i)).toBeNull();
  });

  it('un intento repetido dice que no cuenta como estimación de nivel', async () => {
    await render(<ExamResult attempt={{ ...attempt, repeated: true }} onClose={jest.fn()} />);
    expect(screen.getByText(/ya la habías hecho/)).toBeTruthy();
  });
});
