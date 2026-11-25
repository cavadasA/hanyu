import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Word } from '@hanyu/data';
import { WordSheet } from './WordSheet';

const mockAddCard = jest.fn();
const mockGetSettings = jest.fn();
const mockRecordEvent = jest.fn().mockResolvedValue({ id: 1 });

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      addCard: (...args: unknown[]) => mockAddCard(...args),
    },
    settings: {
      getSettings: () => mockGetSettings(),
    },
    events: {
      recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
    },
  }),
}));

const huan: Word = {
  id: 1,
  hanzi: '还',
  sense_index: null,
  variants: ['还'],
  traditional: '還',
  pinyin: 'huán',
  meaning_en: 'to pay back; to return',
  meaning_es: 'devolver; restituir',
  classifier: null,
  hsk_level: 3,
  pos: 'verb',
  frequency: 1,
  in_srs: false,
};

describe('WordSheet', () => {
  beforeEach(() => {
    mockAddCard.mockReset();
    mockGetSettings.mockReset();
    mockRecordEvent.mockReset().mockResolvedValue({ id: 1 });
  });

  it('muestra la glosa española cuando el idioma de apoyo es español', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    await act(async () => {
      render(
        <WordSheet
          word={huan}
          text="还"
          sentence={null}
          readingId="reading-1"
          onClose={() => {}}
        />,
      );
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('devolver; restituir')).toBeTruthy());
    expect(screen.queryByText('to pay back; to return')).toBeNull();
  });

  it('muestra la glosa inglesa cuando el idioma de apoyo es inglés', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'en' });

    await act(async () => {
      render(
        <WordSheet
          word={huan}
          text="还"
          sentence={null}
          readingId="reading-1"
          onClose={() => {}}
        />,
      );
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('to pay back; to return')).toBeTruthy());
  });

  it('muestra la forma tradicional cuando difiere de la simplificada', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    await act(async () => {
      render(
        <WordSheet
          word={huan}
          text="还"
          sentence={null}
          readingId="reading-1"
          onClose={() => {}}
        />,
      );
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('繁 還')).toBeTruthy());
  });

  const saber = { id: 30, hanzi: '会', pinyin: 'huì', sense_index: 1, meaning_es: 'saber', hsk_level: 1 };
  const reunion = { id: 31, hanzi: '会', pinyin: 'huì', sense_index: 2, meaning_es: 'reunión', hsk_level: 3 };

  it('muestra primero la acepción del token y pliega las demás', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    await act(async () => {
      render(<WordSheet text="会" word={reunion as Word} senses={[saber, reunion]} sentence={null} readingId="r1" onClose={jest.fn()} />);
      await Promise.resolve();
    });

    expect(screen.getByText('reunión')).toBeTruthy();
    expect(screen.queryByText('saber')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('Otros significados'));
    });

    expect(screen.getByText('saber')).toBeTruthy();
  });

  it('«Añadir a Cards» añade la acepción del token, no la primera por nivel', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });
    mockAddCard.mockResolvedValue(undefined);

    await act(async () => {
      render(<WordSheet text="会" word={reunion as Word} senses={[saber, reunion]} sentence={null} readingId="r1" onClose={jest.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getAllByLabelText(/Añadir a Cards/)[0]);
    });

    expect(mockAddCard).toHaveBeenCalledWith(31, expect.anything());
  });

  it('sin «Otros significados» cuando la palabra tiene una sola acepción', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    await act(async () => {
      render(<WordSheet text="会" word={saber as Word} senses={[saber]} sentence={null} readingId="r1" onClose={jest.fn()} />);
      await Promise.resolve();
    });

    expect(screen.queryByText('Otros significados')).toBeNull();
  });

  it('registra la consulta al abrir la ficha de una palabra', async () => {
    // "Consultas por 100 tokens" mide cuánto te cuesta leer. Sin este evento la
    // métrica no existe, y era la única de las once sin emisor.
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    await render(<WordSheet text="还" senses={[huan]} sentence={null} readingId="r1" onClose={() => {}} />);

    await waitFor(() =>
      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'word_looked_up',
          target_kind: 'word',
          payload: expect.objectContaining({ reading_slug: 'r1' }),
        }),
      ),
    );
  });

  it('no registra la consulta dos veces al re-renderizar', async () => {
    // Un efecto sin dependencias correctas inflaría la métrica en silencio.
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    const view = await render(
      <WordSheet text="还" senses={[huan]} sentence={null} readingId="r1" onClose={() => {}} />,
    );
    await view.rerender(
      <WordSheet text="还" senses={[huan]} sentence={null} readingId="r1" onClose={() => {}} />,
    );

    await waitFor(() => expect(mockRecordEvent).toHaveBeenCalledTimes(1));
  });
});
