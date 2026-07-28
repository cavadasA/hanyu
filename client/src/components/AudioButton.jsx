import { useSpeech } from '../hooks/useSpeech';

export default function AudioButton({ text, rate = 0.8, className = '' }) {
  const { speak, supported } = useSpeech();

  if (!supported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => speak(text, rate)}
      className={`rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm ${className}`.trim()}
    >
      Play Audio
    </button>
  );
}