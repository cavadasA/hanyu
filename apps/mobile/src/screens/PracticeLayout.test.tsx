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
  // sesión de expresión. Se quita ese gesto a pantalla completa, pero no el del
  // borde: la pantalla no tiene cabecera y sin él no habría forma de salir.
  it('en la sesión de expresión solo se vuelve atrás desde el borde', async () => {
    await render(<PracticeLayout />);

    const expression = mockScreens.find(screen => screen.name === 'expression');
    expect(expression?.options).toMatchObject({ fullScreenGestureEnabled: false });
    expect(expression?.options?.gestureEnabled).not.toBe(false);
  });

  // El simulacro ya quitaba el gesto dentro de su propio Stack, pero el gesto
  // que lo cerraba era el de la pantalla «exam» en este Stack: un trazo hacia la
  // derecha en 书写 2 sacaba del examen y se perdían todas las respuestas.
  it('el simulacro no se cierra con ningún gesto', async () => {
    await render(<PracticeLayout />);

    const exam = mockScreens.find(screen => screen.name === 'exam');
    expect(exam?.options).toMatchObject({ gestureEnabled: false });
  });
});
