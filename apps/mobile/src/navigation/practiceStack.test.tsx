import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { act, fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import * as PracticeLayout from '../../app/(app)/practice/_layout';

// Tras reiniciar la app, la pila de Practice se restauró con Expresión como
// primera pantalla: ni volver atrás ni tocar la pestaña (popToTop) llevaban al
// índice. La pila de Practice siempre tiene su índice debajo.
describe('pila de Practice', () => {
  const routes = {
    'practice/_layout': PracticeLayout,
    'practice/index': () => <Text>Índice de Practice</Text>,
    'practice/expression': () => <Text>Expresión</Text>,
  };

  it('abierta directamente en Expresión, volver atrás lleva al índice', async () => {
    await renderRouter(routes, { initialUrl: '/practice/expression' });
    expect(screen.getByText('Expresión')).toBeTruthy();

    await act(async () => {
      testRouter.back();
    });
    expect(screen.getByText('Índice de Practice')).toBeTruthy();
  });

  // En la app, la pestaña Practice abría siempre Expresión: al declarar
  // <Stack.Screen name="expression">, expo-router la pone la primera de la pila, y
  // unstable_settings.initialRouteName sólo lo usan los enlaces, no la pestaña.
  it('entrando por la pestaña, Practice abre su índice', async () => {
    await renderRouter(
      {
        _layout: () => <Tabs />,
        today: () => <Text>Hoy</Text>,
        ...routes,
      },
      { initialUrl: '/today' },
    );
    expect(screen.getByText('Hoy')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /practice/i }));
    expect(screen.getByText('Índice de Practice')).toBeTruthy();
    expect(screen.queryByText('Expresión')).toBeNull();
  });
});
