import { create } from 'zustand';

function getStoredTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.localStorage.getItem('hanyu-theme') || 'light';
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

    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }

    set({ theme });
  },
  setCurrentLevel: (currentLevel) => set({ currentLevel }),
  togglePinyin: () => set((state) => ({ showPinyin: !state.showPinyin })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));