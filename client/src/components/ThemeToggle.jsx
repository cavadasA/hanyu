import { useAppStore } from '../stores/appStore';

export default function ThemeToggle() {
  const { theme, setTheme } = useAppStore();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  );
}