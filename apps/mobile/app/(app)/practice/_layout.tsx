import { Stack } from 'expo-router';

export default function PracticeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Desde iOS 26 se vuelve atrás deslizando desde cualquier punto del
          contenido, y un trazo hacia la derecha en el lienzo de escritura sacaba
          de la sesión. Se queda solo el gesto desde el borde: sin cabecera, es
          la única forma de salir de la pantalla. */}
      <Stack.Screen name="expression" options={{ fullScreenGestureEnabled: false }} />
    </Stack>
  );
}
