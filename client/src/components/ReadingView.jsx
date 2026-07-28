import { useState } from 'react';
import AudioButton from './AudioButton';
import PinyinToggle from './PinyinToggle';

export default function ReadingView({ reading }) {
  const [showPinyin, setShowPinyin] = useState(false);

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{reading.title}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Read naturally first, then reveal pinyin if needed.</p>
        </div>
        <div className="flex items-center gap-3">
          <AudioButton text={reading.content} />
          <PinyinToggle show={showPinyin} onToggle={() => setShowPinyin((current) => !current)} />
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-2xl leading-relaxed">{reading.content}</p>
        {showPinyin ? (
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-muted)]">{reading.pinyin_text}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold">Comprehension</h2>
        <div className="space-y-4">
          {reading.questions.map((question, index) => (
            <div key={`${reading.id}-${index}`} className="rounded-xl bg-[var(--color-bg)] p-4">
              <p className="mb-3 font-medium">{question.question}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {question.options.map((option, optionIndex) => (
                  <div key={option} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                    {String.fromCharCode(65 + optionIndex)}. {option}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}