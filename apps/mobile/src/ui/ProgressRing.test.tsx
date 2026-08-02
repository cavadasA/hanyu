import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ProgressRing } from './ProgressRing';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      vermilion: '#c93624',
      border: '#e5e7eb',
      text: '#111827',
      textMuted: '#6b7280',
      gold: '#d97706',
    },
  }),
}));

describe('ProgressRing', () => {
  it('renders the correct number of segments', async () => {
    await render(<ProgressRing segments={3} completed={2} />);
    const arcs = screen.getAllByTestId(/^progress-segment-/);
    expect(arcs).toHaveLength(3);
  });

  it('marks completed segments with active color', async () => {
    await render(<ProgressRing segments={3} completed={1} />);
    expect(screen.getByTestId('progress-segment-0').props.stroke).not.toEqual(
      expect.stringContaining('33'),
    );
  });

  it('renders center children', async () => {
    await render(
      <ProgressRing segments={3} completed={0}>
        <Text>12 min</Text>
      </ProgressRing>,
    );
    expect(screen.getByText('12 min')).toBeTruthy();
  });
});
