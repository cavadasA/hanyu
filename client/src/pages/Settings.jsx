import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAppStore } from '../stores/appStore';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const { setTheme } = useAppStore();

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await api.getSettings();
        setSettings(data);
        if (data.theme) {
          setTheme(data.theme);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }

    loadSettings();
  }, [setTheme]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);

    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      if (updated.theme) {
        setTheme(updated.theme);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p>Loading settings...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings Panel</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Tune the daily workload, preferred level, and optional AI provider.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <section className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <Field label="Theme">
            <select
              aria-label="Theme"
              value={settings.theme}
              onChange={(event) => setSettings((current) => ({ ...current, theme: event.target.value }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>

          <Field label="Current HSK level">
            <select
              aria-label="Current HSK level"
              value={settings.current_level}
              onChange={(event) => setSettings((current) => ({ ...current, current_level: Number(event.target.value) }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  HSK {value}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cards per day">
            <input
              aria-label="Cards per day"
              type="number"
              min="1"
              max="200"
              value={settings.cards_per_day}
              onChange={(event) => setSettings((current) => ({ ...current, cards_per_day: Number(event.target.value) }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            />
          </Field>
        </section>

        <section className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <Field label="AI provider">
            <select
              aria-label="AI provider"
              value={settings.ai_provider}
              onChange={(event) => setSettings((current) => ({ ...current, ai_provider: event.target.value }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            >
              <option value="none">None</option>
              <option value="deepseek">DeepSeek</option>
              <option value="gemini">Gemini</option>
            </select>
          </Field>

          <Field label="API key">
            <input
              aria-label="API key"
              type="password"
              value={settings.api_key}
              onChange={(event) => setSettings((current) => ({ ...current, api_key: event.target.value }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            />
          </Field>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[var(--color-vermilion)] px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </section>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}