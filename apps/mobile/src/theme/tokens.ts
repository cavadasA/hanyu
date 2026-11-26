const light = {
  bg: '#ffffff',
  surface: '#f9fafb',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  vermilion: '#c93624',
  gold: '#946d00',
  info: '#2563eb',
  success: '#047857',
  onAccent: '#ffffff',
  // Texto secundario sobre el bermellón: 4,76:1 (onAccent al 90 % daba 4,497:1).
  onAccentMuted: '#fcf3f2',
};

const dark = {
  bg: '#0f172a',
  surface: '#1e293b',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  border: '#334155',
  vermilion: '#ff7664',
  gold: '#e5b93f',
  info: '#60a5fa',
  success: '#34d399',
  onAccent: '#0f172a',
  // Texto secundario sobre el bermellón: 6,35:1.
  onAccentMuted: '#1d1d2d',
};

export type ThemeColors = typeof light;

export const tokens = {
  colors: { light, dark },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, hanzi: 44 },
};
