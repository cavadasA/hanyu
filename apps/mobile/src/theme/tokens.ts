const light = {
  bg: '#ffffff',
  surface: '#f9fafb',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  vermilion: '#c93624',
  gold: '#946d00',
  onAccent: '#ffffff',
};

const dark = {
  bg: '#0f172a',
  surface: '#1e293b',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  border: '#334155',
  vermilion: '#ff7664',
  gold: '#e5b93f',
  onAccent: '#0f172a',
};

export type ThemeColors = typeof light;

export const tokens = {
  colors: { light, dark },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, hanzi: 44 },
};
