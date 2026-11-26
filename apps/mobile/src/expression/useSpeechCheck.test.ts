import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSpeechCheck } from './useSpeechCheck';

type Listener = (event: any) => void;
const mockListeners: Record<string, Listener[]> = {};
const mockModule = {
  isRecognitionAvailable: jest.fn(() => true),
  getSupportedLocales: jest.fn(async () => ({ locales: ['en-US', 'zh-CN'], installedLocales: ['zh-CN'] })),
  supportsOnDeviceRecognition: jest.fn(() => true),
  supportsRecording: jest.fn(() => true),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  addListener: jest.fn((event: string, listener: Listener) => {
    (mockListeners[event] ??= []).push(listener);
    return {
      remove: () => {
        mockListeners[event] = mockListeners[event].filter((entry) => entry !== listener);
      },
    };
  }),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
};

jest.mock('expo-speech-recognition', () => ({
  get ExpoSpeechRecognitionModule() {
    return mockModule;
  },
}));

function emit(event: string, payload: unknown = {}) {
  for (const listener of [...(mockListeners[event] ?? [])]) listener(payload);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockListeners)) delete mockListeners[key];
  mockModule.isRecognitionAvailable.mockReturnValue(true);
  mockModule.getSupportedLocales.mockResolvedValue({ locales: ['en-US', 'zh-CN'], installedLocales: ['zh-CN'] });
  mockModule.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
});

async function ready() {
  const hook = await renderHook(() => useSpeechCheck());
  await waitFor(() => expect(hook.result.current.status).not.toBe('checking'));
  return hook;
}

describe('useSpeechCheck', () => {
  it('sin reconocedor en el dispositivo: no disponible', async () => {
    mockModule.isRecognitionAvailable.mockReturnValue(false);
    const { result } = await ready();

    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe('unsupported');
  });

  it('sin chino mandarín (zh-CN) en el reconocedor: no disponible', async () => {
    mockModule.getSupportedLocales.mockResolvedValue({ locales: ['en-US', 'es-ES'], installedLocales: [] });
    const { result } = await ready();

    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe('unsupported');
  });

  it('con el permiso denegado: no disponible', async () => {
    mockModule.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' });
    const { result } = await ready();

    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe('denied');
  });

  it('con el permiso aún sin pedir: disponible, y lo pide al escuchar', async () => {
    mockModule.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
    const { result } = await ready();
    expect(result.current.available).toBe(true);

    let listening!: Promise<unknown>;
    await act(async () => {
      listening = result.current.listen({ hanzi: '你好', pinyin: 'nǐ hǎo' });
    });
    await waitFor(() => expect(mockModule.start).toHaveBeenCalled());
    expect(mockModule.requestPermissionsAsync).toHaveBeenCalled();
    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: '你好' }] });
      emit('end');
    });
    await listening;
  });

  it('«我是学生» para wǒ shì xuésheng → inteligible, en mandarín y en el dispositivo', async () => {
    const { result } = await ready();

    let listening!: Promise<any>;
    await act(async () => {
      listening = result.current.listen({ hanzi: '我是学生', pinyin: 'wǒ shì xuésheng' });
    });
    await waitFor(() => expect(mockModule.start).toHaveBeenCalled());
    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: '我是学生。' }] });
      emit('audioend', { uri: 'file:///cache/recording.wav' });
      emit('end');
    });
    const outcome = await listening;

    expect(mockModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: 'zh-CN',
        requiresOnDeviceRecognition: true,
        recordingOptions: expect.objectContaining({ persist: true, outputSampleRate: 16000, outputEncoding: 'pcmFormatInt16' }),
      }),
    );
    expect(outcome.status).toBe('heard');
    expect(outcome.transcript).toBe('我是学生。');
    expect(outcome.audioUri).toBe('file:///cache/recording.wav');
    expect(outcome.comparison.intelligible).toBe(true);
  });

  it('un homófono (事 por 是) cuenta como acierto: se compara en pinyin, no en hanzi', async () => {
    const { result } = await ready();

    let listening!: Promise<any>;
    await act(async () => {
      listening = result.current.listen({ hanzi: '是', pinyin: 'shì' });
    });
    await waitFor(() => expect(mockModule.start).toHaveBeenCalled());
    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: '事' }] });
      emit('end');
    });

    expect((await listening).comparison.intelligible).toBe(true);
  });

  it('sin voz: se oyó nada, no inteligible', async () => {
    const { result } = await ready();

    let listening!: Promise<any>;
    await act(async () => {
      listening = result.current.listen({ hanzi: '你好', pinyin: 'nǐ hǎo' });
    });
    await waitFor(() => expect(mockModule.start).toHaveBeenCalled());
    await act(async () => {
      emit('error', { error: 'no-speech', message: '' });
      emit('end');
    });
    const outcome = await listening;

    expect(outcome.status).toBe('heard');
    expect(outcome.comparison.intelligible).toBe(false);
  });

  it('si el permiso se deniega al escuchar, pasa a no disponible y no hay resultado que evaluar', async () => {
    mockModule.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
    mockModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' });
    const { result } = await ready();

    let outcome: any;
    await act(async () => {
      outcome = await result.current.listen({ hanzi: '你好', pinyin: 'nǐ hǎo' });
    });

    expect(outcome).toEqual({ status: 'unavailable', reason: 'denied' });
    expect(mockModule.start).not.toHaveBeenCalled();
    expect(result.current.available).toBe(false);
  });
});
