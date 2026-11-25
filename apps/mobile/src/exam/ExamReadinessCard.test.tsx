import { render, screen, waitFor } from '@testing-library/react-native';
import { ExamReadinessCard } from './ExamReadinessCard';

const mockList = jest.fn();
jest.mock('../lib/data', () => ({ getData: () => ({ exam: { listExamAttempts: (...args: unknown[]) => mockList(...args) } }) }));
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: { surface: '#fff', text: '#111', textMuted: '#666', border: '#ddd', vermilion: '#c93624' } }),
}));

const full = (finished_at: string, total_percent: number, part_scores: object, repeated = false) => ({
  scope: 'full', repeated, finished_at, total_percent, part_scores,
});

describe('ExamReadinessCard', () => {
  it('tras simulacros completos muestra el último porcentaje y la parte más floja', async () => {
    mockList.mockResolvedValue([
      full('2026-11-20T10:00:00Z', 55, { L1: { correct: 2, total: 5, percent: 40 } }),
      full('2026-11-22T10:00:00Z', 67, { L1: { correct: 5, total: 5, percent: 100 }, W2: { correct: 1, total: 5, percent: 20 } }),
    ]);
    await render(<ExamReadinessCard />);
    await waitFor(() => expect(screen.getByText('Último simulacro: 67 %')).toBeTruthy());
    expect(screen.getByText('Parte más floja: 书写 2')).toBeTruthy();
    expect(screen.getByText('Evolución: 55 % → 67 %')).toBeTruthy();
    expect(mockList).toHaveBeenCalledWith(2);
  });

  it('sin simulacros completos no muestra nada, ni un cero', async () => {
    mockList.mockResolvedValue([full('2026-11-20T10:00:00Z', 90, {}, true)]);
    await render(<ExamReadinessCard />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByText(/simulacro/i)).toBeNull();
    expect(screen.queryByText(/0 %/)).toBeNull();
  });

  it('si no se pueden leer los simulacros lo dice', async () => {
    mockList.mockRejectedValue(new Error('sin red'));
    await render(<ExamReadinessCard />);
    await waitFor(() => expect(screen.getByText('No se pudieron cargar tus simulacros.')).toBeTruthy());
  });
});
