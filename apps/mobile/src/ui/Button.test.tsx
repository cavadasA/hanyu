import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  buildResponderGrantEvent,
  buildResponderReleaseEvent,
} from '@testing-library/react-native/dist/event-builder';
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

/** Every style object in the (possibly nested) resolved style array must have
 * an array `transform` — RN 0.86's processTransform crashes with
 * "Cannot read property 'forEach' of null" when it receives null/undefined. */
function expectTransformsAreArrays(style: unknown) {
  const objects = (Array.isArray(style) ? style : [style]).filter(Boolean);
  for (const entry of objects) {
    if (entry && typeof entry === 'object' && 'transform' in entry) {
      expect(Array.isArray((entry as { transform: unknown }).transform)).toBe(true);
    }
  }
}

describe('Button', () => {
  it('exposes the selected state to assistive technology', async () => {
    await render(<Button label="HSK 2" onPress={jest.fn()} selected />);

    expect(screen.getByRole('button', { name: 'HSK 2' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  // Los botones de velocidad del lector (0.75x/1x/1.25x) no marcaban cuál estaba activa.
  it('un botón secundario seleccionado se distingue a la vista', async () => {
    const flat = (style: unknown) => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
    await render(
      <>
        <Button label="1x" variant="secondary" onPress={jest.fn()} selected />
        <Button label="1.25x" variant="secondary" onPress={jest.fn()} />
      </>,
    );

    const selected = flat(screen.getByRole('button', { name: '1x' }).props.style);
    const other = flat(screen.getByRole('button', { name: '1.25x' }).props.style);
    expect(selected.borderColor).toBe('#c93624');
    expect(other.borderColor).toBe('#e5e7eb');
    expect(screen.getByText('1x').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#c93624' })]));
  });

  it('keeps transform a valid array while pressed', async () => {
    await render(<Button label="Rate" onPress={jest.fn()} />);

    const button = screen.getByRole('button', { name: 'Rate' });
    expectTransformsAreArrays(button.props.style);

    // Pressability only listens to responder events; pressIn/pressOut are
    // never delivered, so drive the real grant/release cycle. RNTL v14's
    // fireEvent is async: await it or the pressed-state flush is skipped.
    await fireEvent(button, 'responderGrant', buildResponderGrantEvent());
    expectTransformsAreArrays(screen.getByRole('button', { name: 'Rate' }).props.style);

    await fireEvent(button, 'responderRelease', buildResponderReleaseEvent());
    expectTransformsAreArrays(screen.getByRole('button', { name: 'Rate' }).props.style);
  });
});
