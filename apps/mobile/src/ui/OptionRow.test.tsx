import { fireEvent, render, screen } from '@testing-library/react-native';
import { OptionRow } from './OptionRow';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      surface: '#f9fafb',
      text: '#111827',
      border: '#e5e7eb',
      vermilion: '#c93624',
      onAccent: '#ffffff',
      onAccentMuted: '#fcf3f2',
      textMuted: '#6b7280',
    },
  }),
}));

describe('OptionRow', () => {
  it('enseña la etiqueta y el valor en dos líneas, sin partir palabras', async () => {
    const onChange = jest.fn();
    await render(
      <OptionRow
        label="Retención objetivo"
        value="Equilibrado"
        options={['Relajado', 'Equilibrado', 'Exigente'] as const}
        sublabels={{ Relajado: '0,85', Equilibrado: '0,90', Exigente: '0,95' }}
        onChange={onChange}
      />,
    );

    const label = screen.getByText('Equilibrado');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(screen.getByText('0,90')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Exigente (0,95)' }));
    expect(onChange).toHaveBeenCalledWith('Exigente');
  });

  it('usa las etiquetas traducidas sin cambiar el valor que devuelve', async () => {
    const onChange = jest.fn();
    await render(
      <OptionRow
        label="Tema"
        value="light"
        options={['light', 'dark', 'system'] as const}
        labels={{ light: 'Claro', dark: 'Oscuro', system: 'Sistema' }}
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Oscuro' }));
    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.getByText('Sistema').props.numberOfLines).toBe(1);
  });
});
