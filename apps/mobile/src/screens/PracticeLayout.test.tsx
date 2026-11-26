import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import PracticeLayout from '../../app/(app)/practice/_layout';

const mockScreens: Array<{ name: string; options?: Record<string, unknown> }> = [];

jest.mock('expo-router', () => {
  const Stack = ({ children }: { children?: ReactNode }) => <>{children}</>;
  Stack.Screen = (props: { name: string; options?: Record<string, unknown> }) => {
    mockScreens.push(props);
    return null;
  };
  return { Stack };
});

describe('PracticeLayout', () => {
  // Desde iOS 26 se vuelve atrás deslizando desde cualquier punto del
  // contenido: un trazo hacia la derecha en el lienzo de escritura sacaba de la
  // sesión de expresión. Como en el simulacro, esa pantalla no admite el gesto.
  it('desactiva el gesto de volver en la sesión de expresión', async () => {
    await render(<PracticeLayout />);

    expect(mockScreens).toContainEqual(
      expect.objectContaining({ name: 'expression', options: expect.objectContaining({ gestureEnabled: false }) }),
    );
  });
});
