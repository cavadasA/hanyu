export default function PinyinToggle({ show, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
    >
      {show ? 'Hide Pinyin' : 'Show Pinyin'}
    </button>
  );
}