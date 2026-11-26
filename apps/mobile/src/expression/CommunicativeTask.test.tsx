import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CommunicativeContext, CommunicativeTask as Task } from '@hanyu/domain';
import { CommunicativeTask } from './CommunicativeTask';

const mockSpeech = { status: 'ready' as string, available: true, transcribe: jest.fn(), listen: jest.fn(), stop: jest.fn() };
jest.mock('./useSpeechCheck', () => ({ useSpeechCheck: () => mockSpeech }));
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: { bg: '#fff', surface: '#fff', text: '#111', textMuted: '#666', border: '#ddd', vermilion: '#c93624', onAccent: '#fff', success: '#2a7' },
  }),
}));

const TASK: Task = {
  slug: '2-03-rechazar-invitacion',
  hsk_level: 2,
  situation_es: 'Tu compañera te invita al cine el sábado. No puedes: explica por qué y propón otro día.',
  mode: 'write',
  intent: ['rechazar la invitación', 'dar un motivo', 'proponer otro día'],
  required_markers: [{ hsk_level: 2, code: '6.4.3' }],
  min_chars: 6,
  max_chars: 30,
  model_answer: { zh: '我今天有事，所以不能去。明天去吧！', pinyin: 'Wǒ jīntiān yǒu shì, suǒyǐ bù néng qù. Míngtiān qù ba!', es: 'Hoy tengo cosas, así que no puedo ir. ¡Vamos mañana!' },
};

const CTX: CommunicativeContext = {
  dictionary: ['我', '今天', '有', '事', '不', '能', '去', '明天', '吧', '所以', '因为'].map((hanzi) => ({ hanzi, hsk_level: 1 })),
  grammar_points: [{ hsk_level: 2, code: '6.4.3', markers: ['因为', '所以'] }],
};

const ANSWER = '我今天有事，所以不能去。明天去吧！';

beforeEach(() => {
  jest.clearAllMocks();
  mockSpeech.status = 'ready';
  mockSpeech.available = true;
});

async function answer(text: string, grade = jest.fn(), task: Task = TASK) {
  const onFinished = jest.fn();
  await render(<CommunicativeTask task={task} context={CTX} grade={grade} onFinished={onFinished} />);
  await fireEvent.changeText(screen.getByLabelText('Tu respuesta'), text);
  await fireEvent.press(screen.getByLabelText('Enviar'));
  return { onFinished, grade };
}

describe('CommunicativeTask', () => {
  it('muestra la situación, lo que debe hacer la respuesta y la estructura que se pide', async () => {
    await render(<CommunicativeTask task={TASK} context={CTX} grade={jest.fn()} onFinished={jest.fn()} />);

    expect(screen.getByText(TASK.situation_es)).toBeTruthy();
    expect(screen.getByText('proponer otro día')).toBeTruthy();
    expect(screen.getByText(/因为…所以|因为 \/ 所以/)).toBeTruthy();
  });

  it('una respuesta en pinyin se rechaza antes de llamar al corrector, con el motivo', async () => {
    const { grade, onFinished } = await answer('wo bu neng qu');

    expect(screen.getByText(/caracteres chinos/)).toBeTruthy();
    expect(grade).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
  });

  // El aviso de un envío anterior seguía en pantalla después de corregir el texto.
  it('el aviso de validación desaparece en cuanto se cambia la respuesta', async () => {
    await answer('wo bu neng qu');
    expect(screen.getByText(/caracteres chinos/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Tu respuesta'), '我');
    expect(screen.queryByText(/caracteres chinos/)).toBeNull();
  });

  it('sin la estructura pedida: lo dice, y no se corrige', async () => {
    const { grade } = await answer('我今天有事，不能去。明天去吧！');

    expect(screen.getByText(/Falta la estructura/)).toBeTruthy();
    expect(grade).not.toHaveBeenCalled();
  });

  it('con vocabulario fuera del nivel: lo dice con las palabras', async () => {
    const { grade } = await answer('我今天有事，所以不能去。已经晚了。');

    expect(screen.getByText(/Fuera del nivel: .*已/)).toBeTruthy();
    expect(grade).not.toHaveBeenCalled();
  });

  it('corregida y aprobada: lo dice, con la devolución y la respuesta modelo', async () => {
    const grade = jest.fn(async () => ({ status: 'graded' as const, passed: true, intents: [true, true, true], feedback_es: 'Muy bien: rechazas, explicas y propones.' }));
    const { onFinished } = await answer(ANSWER, grade);

    await waitFor(() => expect(screen.getByText('Muy bien: rechazas, explicas y propones.')).toBeTruthy());
    expect(grade).toHaveBeenCalledWith({ task_slug: TASK.slug, answer: ANSWER });
    expect(screen.getByText(TASK.model_answer.zh)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(onFinished).toHaveBeenCalledWith({ status: 'graded', passed: true });
  });

  it('corregida y suspendida: marca qué intención falta', async () => {
    const grade = jest.fn(async () => ({ status: 'graded' as const, passed: false, intents: [true, true, false], feedback_es: 'No propones otro día.' }));
    const { onFinished } = await answer(ANSWER, grade);

    await waitFor(() => expect(screen.getByText('No propones otro día.')).toBeTruthy());
    expect(screen.getByLabelText('proponer otro día: no cumplida')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(onFinished).toHaveBeenCalledWith({ status: 'graded', passed: false });
  });

  it('el corrector no responde: queda «sin corregir» y no cuenta', async () => {
    const grade = jest.fn(async () => ({ status: 'ungraded' as const }));
    const { onFinished } = await answer(ANSWER, grade);

    await waitFor(() => expect(screen.getByText(/Sin corregir/)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(onFinished).toHaveBeenCalledWith({ status: 'ungraded' });
  });

  it('sin corrector configurado: lo dice y queda sin corregir', async () => {
    const grade = jest.fn(async () => ({ status: 'unavailable' as const, reason: 'not_configured' }));
    const { onFinished } = await answer(ANSWER, grade);

    await waitFor(() => expect(screen.getByText(/Sin corregir/)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(onFinished).toHaveBeenCalledWith({ status: 'unavailable', reason: 'not_configured' });
  });

  it('modo hablado: transcribe y corrige la transcripción como texto', async () => {
    mockSpeech.transcribe.mockResolvedValue({ status: 'transcribed', transcript: ANSWER });
    const grade = jest.fn(async () => ({ status: 'graded' as const, passed: true, intents: [true, true, true], feedback_es: 'Bien.' }));
    const onFinished = jest.fn();
    await render(<CommunicativeTask task={{ ...TASK, mode: 'speak' }} context={CTX} grade={grade} onFinished={onFinished} />);

    expect(screen.queryByLabelText('Tu respuesta')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Hablar'));
    await waitFor(() => expect(screen.getByText(ANSWER)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Enviar'));

    await waitFor(() => expect(grade).toHaveBeenCalledWith({ task_slug: TASK.slug, answer: ANSWER }));
  });
});
