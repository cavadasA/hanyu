import { useAppStore } from '../stores/appStore';

const nextTheme = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const labels = {
  light: 'Theme: Light',
  dark: 'Theme: Dark',
  system: 'Theme: System',
};

export default function ThemeToggle() {
  const { theme, setTheme } = useAppStore();
  const currentTheme = theme || 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme[currentTheme] || 'light')}
      className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
      aria-label="Toggle theme"
    >
      {labels[currentTheme] || labels.light}
    </button>
  );
}