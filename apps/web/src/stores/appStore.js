import { create } from 'zustand';

function getStoredTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.localStorage.getItem('hanyu-theme') || 'light';
}

function resolveTheme(theme) {
  if (theme !== 'system') {
    return theme;
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
}

function applyThemeClass(theme) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
}

export const useAppStore = create((set) => ({
  theme: getStoredTheme(),
  currentLevel: 1,
  showPinyin: true,
  loading: false,
  error: null,
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hanyu-theme', theme);
    }

    applyThemeClass(theme);

    set({ theme });
  },
  setCurrentLevel: (currentLevel) => set({ currentLevel }),
  togglePinyin: () => set((state) => ({ showPinyin: !state.showPinyin })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));