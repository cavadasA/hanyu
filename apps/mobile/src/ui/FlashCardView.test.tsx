import { fireEvent, render, screen } from '@testing-library/react-native';
import { emptyState } from '@hanyu/domain';
import type { DueCard } from '@hanyu/data';
import { FlashCardView } from './FlashCardView';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      bg: '#fff',
      surface: '#f5f5f5',
      border: '#ddd',
      text: '#111',
      textMuted: '#666',
      vermilion: '#c93624',
      gold: '#d97706',
      onAccent: '#fff',
      success: '#16803c',
    },
  }),
}));

jest.mock('../lib/useSupportLanguage', () => ({
  useSupportLanguage: () => 'es',
}));

jest.mock('../audio/useSpeech', () => ({
  useSpeech: () => ({ speak: jest.fn(), stop: jest.fn() }),
}));

const baseCard: DueCard = {
  id: 'card-1',
  user_id: 'user-1',
  word_id: 1,
  skill: 'recognition',
  scheduling: emptyState(new Date('2026-09-03T10:00:00.000Z')),
  version: 1,
  hanzi: '还',
  pinyin: 'huán',
  meaning_es: 'devolver; restituir',
  meaning_en: 'to pay back; to return',
  hsk_level: 3,
};

describe('FlashCardView', () => {
  it('muestra la forma tradicional, el clasificador y la frase de origen al revelar', async () => {
    const card = {
      ...baseCard,
      traditional: '還',
      sense_index: 2,
      classifier: '次',
      context: { sentence: '我明天还你钱。', source_kind: 'reading' as const, source_id: 'r1' },
    };

    await render(<FlashCardView card={card} mode="recognition" revealed onRate={jest.fn()} />);

    expect(screen.getByText('繁 還')).toBeTruthy();
    expect(screen.getByText('量 次')).toBeTruthy();
    expect(screen.getByText('我明天还你钱。')).toBeTruthy();
  });

  it('distingue las acepciones de la misma forma escrita', async () => {
    const card = { ...baseCard, sense_index: 2 };

    await render(<FlashCardView card={card} mode="recognition" revealed onRate={jest.fn()} />);

    expect(screen.getByLabelText('Sense 2')).toBeTruthy();
  });

  it('mantiene el resultado escrito visible hasta que el usuario continúa', async () => {
    const onRate = jest.fn();
    await render(<FlashCardView card={baseCard} mode="recall" onRate={onRate} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '还');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(onRate).not.toHaveBeenCalled();
    expect(screen.getByText('Correct')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(onRate).toHaveBeenCalledWith('easy', expect.any(Number));
  });

  it('permite corregir un fallo escrito y valora una sola vez al continuar', async () => {
    const onRate = jest.fn();
    await render(<FlashCardView card={baseCard} mode="recall" onRate={onRate} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '学');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await fireEvent.press(screen.getByRole('button', { name: 'I actually knew it' }));

    expect(onRate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith('hard', expect.any(Number));
  });

  it('resetea input y veredicto al cambiar a la tarjeta siguiente', async () => {
    const onRate = jest.fn();
    const nextCard = { ...baseCard, id: 'card-2', hanzi: '学' };
    const view = await render(<FlashCardView card={baseCard} mode="recall" onRate={onRate} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '还');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Correct')).toBeTruthy();

    await view.rerender(<FlashCardView card={nextCard} mode="recall" onRate={onRate} />);

    expect(screen.getByPlaceholderText('Type the answer').props.value).toBe('');
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});
