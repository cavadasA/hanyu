import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ExamRunner } from './ExamRunner';
import { ExamResult } from './ExamResult';
import { loadExamProgress } from './examProgressStore';

jest.mock('../session/SessionProvider', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }));

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

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
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
  const view = await render(<ExamRunner formCode={null} />);
  await waitFor(() => expect(screen.getByLabelText('Empezar')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Empezar'));
  return view;
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

  it('en la hoja de respuestas no suena nada ni se anuncia ninguna pregunta activa', async () => {
    await start();
    await advance(35_000);
    expect(screen.getByText('Hoja de respuestas de 听力')).toBeTruthy();
    expect(screen.queryByText(/^Ahora:/)).toBeNull();
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

  it('en 听力 no se puede terminar antes: va al ritmo del audio', async () => {
    await start();
    expect(screen.queryByLabelText('Terminar 听力')).toBeNull();
    expect(screen.queryByLabelText(/^Pasar a|^Terminar|^Entregar/)).toBeNull();
  });

  it('terminar 阅读 antes de tiempo pide confirmación y abre 书写 con sus 10 minutos', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await start();
    await advance(35_000 + 3 * 60_000);
    expect(screen.getByText('阅读')).toBeTruthy();
    await advance(5 * 60_000);

    await fireEvent.press(screen.getByLabelText('Terminar 阅读'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toBe('No podrás volver a esta sección.');
    expect(screen.getByText('阅读')).toBeTruthy();
    const buttons = alert.mock.calls[0][2] ?? [];
    await act(async () => {
      buttons.find(button => button.style === 'destructive')?.onPress?.();
    });

    expect(screen.getByText('书写')).toBeTruthy();
    expect(screen.getByText('10:00')).toBeTruthy();
    alert.mockRestore();
  });

  it('«Entregar» en 书写 entrega al confirmar, con lo respondido hasta entonces', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await start();
    await fireEvent.press(screen.getByLabelText('Pregunta 1, imagen C'));
    await advance(35_000 + (3 + 25) * 60_000);
    expect(screen.getByText('书写')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Entregar'));
    expect(mockSubmit).not.toHaveBeenCalled();
    // Al entregar no se «vuelve a una sección»: lo que se pierde es poder cambiar respuestas.
    expect(alert.mock.calls[0][1]).toBe('No podrás cambiar tus respuestas.');
    await act(async () => {
      (alert.mock.calls[0][2] ?? []).find(button => button.style === 'destructive')?.onPress?.();
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit.mock.calls[0][0].answers['a-l1']).toEqual([2, null, null]);
    alert.mockRestore();
  });

  // En 书写 2 la página tiene que poder desplazarse entre preguntas, pero no mientras se
  // dibuja: el ScrollView se quedaba el gesto, el trazo se cortaba y el carácter salía
  // aplastado e irreconocible.
  it('mientras se dibuja en 书写 2 la página no se desplaza', async () => {
    await start();
    await advance(35_000 + (3 + 25) * 60_000);
    expect(screen.getByText('书写')).toBeTruthy();
    const page = screen.getByTestId('screen-scroll');
    const canvas = screen.getByTestId('exam-writing-canvas');
    expect(page.props.scrollEnabled).toBe(true);

    await fireEvent(canvas, 'touchStart');
    expect(screen.getByTestId('screen-scroll').props.scrollEnabled).toBe(false);

    await fireEvent(canvas, 'touchEnd');
    expect(screen.getByTestId('screen-scroll').props.scrollEnabled).toBe(true);

    await fireEvent(canvas, 'touchStart');
    await fireEvent(canvas, 'touchCancel');
    expect(screen.getByTestId('screen-scroll').props.scrollEnabled).toBe(true);
  });

  // Con 51 minutos de examen, una llamada o que el sistema mate la app no puede costar el intento.
  describe('si la app se cierra a mitad del simulacro', () => {
    async function closeDuringReading() {
      const view = await start();
      await fireEvent.press(screen.getByLabelText('Pregunta 1, imagen C'));
      await advance(35_000 + 3 * 60_000 + 5 * 60_000); // 5 min dentro de 阅读
      expect(screen.getByText('阅读')).toBeTruthy();
      await view.unmount();
    }

    it('al volver ofrece reanudarlo en su fase, con su reloj', async () => {
      await closeDuringReading();
      await render(<ExamRunner formCode={null} />);
      await waitFor(() => expect(screen.getByLabelText('Reanudar')).toBeTruthy());
      expect(screen.getByText(/a medias/)).toBeTruthy();

      await fireEvent.press(screen.getByLabelText('Reanudar'));
      await advance(0);
      expect(screen.getByText('阅读')).toBeTruthy();
      expect(screen.getByText('20:00')).toBeTruthy();
    });

    it('el reloj siguió corriendo mientras estaba cerrada, y se entregan las respuestas de antes', async () => {
      await closeDuringReading();
      await advance(25 * 60_000); // 20 min de 阅读 + 5 de 书写
      await render(<ExamRunner formCode={null} />);
      await waitFor(() => expect(screen.getByLabelText('Reanudar')).toBeTruthy());
      await fireEvent.press(screen.getByLabelText('Reanudar'));
      await advance(0);
      expect(screen.getByText('书写')).toBeTruthy();
      expect(screen.getByText('5:00')).toBeTruthy();

      await advance(5 * 60_000);
      await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
      expect(mockSubmit.mock.calls[0][0].answers['a-l1']).toEqual([2, null, null]);
    });

    it('«Empezar de nuevo» pide confirmación y descarta lo guardado', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      await closeDuringReading();
      await render(<ExamRunner formCode={null} />);
      await waitFor(() => expect(screen.getByLabelText('Empezar de nuevo')).toBeTruthy());
      await fireEvent.press(screen.getByLabelText('Empezar de nuevo'));
      expect(screen.queryByText('听力')).toBeNull();
      await act(async () => {
        (alert.mock.calls[0][2] ?? []).find(button => button.style === 'destructive')?.onPress?.();
      });
      expect(screen.getByText('听力')).toBeTruthy();
      await waitFor(async () => expect((await loadExamProgress('u1', 2, 'A'))?.phase).toBe('listening'));
      alert.mockRestore();
    });

    it('tras entregar con éxito ya no queda nada que reanudar', async () => {
      await start();
      await advance(35_000 + (3 + 25 + 10) * 60_000);
      await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
      await waitFor(async () => expect(await loadExamProgress('u1', 2, 'A')).toBeNull());
    });
  });

  // 阅读 y 书写 se abrían a mitad de página, a la altura donde quedó la fase anterior.
  it('cada fase empieza con la página arriba, en un desplazamiento nuevo', async () => {
    await start();
    await advance(35_000 + 3 * 60_000);
    expect(screen.getByText('阅读')).toBeTruthy();
    const reading = screen.getByTestId('screen-scroll');
    await fireEvent.scroll(reading, { nativeEvent: { contentOffset: { x: 0, y: 1200 } } });

    await advance(25 * 60_000);
    expect(screen.getByText('书写')).toBeTruthy();
    const writing = screen.getByTestId('screen-scroll');
    expect(writing).not.toBe(reading);
    expect(writing.props.contentOffset ?? { x: 0, y: 0 }).toEqual({ x: 0, y: 0 });
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
