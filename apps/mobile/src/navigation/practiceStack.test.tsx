import { Text } from 'react-native';
import { act, renderRouter, screen, testRouter } from 'expo-router/testing-library';
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
});
