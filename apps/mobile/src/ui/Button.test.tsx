import { render, screen } from '@testing-library/react-native';
import { Button } from './Button';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      surface: '#f9fafb',
      text: '#111827',
      border: '#e5e7eb',
      vermilion: '#c93624',
      onAccent: '#ffffff',
    },
  }),
}));

describe('Button', () => {
  it('exposes the selected state to assistive technology', async () => {
    await render(<Button label="HSK 2" onPress={jest.fn()} selected />);

    expect(screen.getByRole('button', { name: 'HSK 2' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
