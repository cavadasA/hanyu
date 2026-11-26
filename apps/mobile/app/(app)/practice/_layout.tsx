import { Stack } from 'expo-router';

export default function PracticeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Desde iOS 26 se vuelve atrás deslizando desde cualquier punto del
          contenido: un trazo hacia la derecha en el lienzo de escritura sacaba
          de la sesión. Como en el simulacro, aquí no hay gesto de volver. */}
      <Stack.Screen name="expression" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
