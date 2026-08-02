import { render, screen } from '@testing-library/react-native';
import { CardStatusBadge } from './CardStatusBadge';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      info: '#3b82f6',
      vermilion: '#c93624',
      gold: '#d97706',
    },
  }),
}));

describe('CardStatusBadge', () => {
  it('renders status label for learning', async () => {
    await render(<CardStatusBadge status="learning" />);
    expect(screen.getByText('Learning')).toBeTruthy();
  });

  it('renders status label for review', async () => {
    await render(<CardStatusBadge status="review" />);
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('renders status label for new', async () => {
    await render(<CardStatusBadge status="new" />);
    expect(screen.getByText('New')).toBeTruthy();
  });
});
