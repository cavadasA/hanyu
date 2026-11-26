import { Stack } from 'expo-router';

// El índice está siempre debajo, aunque se entre directo a una pantalla (un enlace
// o la pila restaurada al reiniciar): si no, Expresión quedaba como primera
// pantalla y ni volver atrás ni tocar la pestaña Practice llevaban al índice.
export const unstable_settings = { initialRouteName: 'index' };

export default function PracticeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Desde iOS 26 se vuelve atrás deslizando desde cualquier punto del
          contenido, y un trazo hacia la derecha en el lienzo de escritura sacaba
          de la sesión. Se queda solo el gesto desde el borde: sin cabecera, es
          la única forma de salir de la pantalla. */}
      <Stack.Screen name="expression" options={{ fullScreenGestureEnabled: false }} />
      {/* El simulacro no se cierra con ningún gesto (como dentro de su propio
          Stack): un trazo en 书写 2 lo cerraba y se perdían todas las respuestas. */}
      <Stack.Screen name="exam" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
