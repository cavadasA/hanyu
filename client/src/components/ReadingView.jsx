import { useState } from 'react';
import AudioButton from './AudioButton';
import PinyinToggle from './PinyinToggle';
import WordPopup from './WordPopup';

export default function ReadingView({ reading }) {
  const [showPinyin, setShowPinyin] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [popup, setPopup] = useState(null);

  function handleAnswer(questionIndex, answer) {
    if (submitted) {
      return;
    }

    setAnswers((current) => ({
      ...current,
      [questionIndex]: answer,
    }));
  }

  const score = submitted
    ? reading.questions.filter((question, index) => answers[index] === question.correct).length
    : null;

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

      <section className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-2xl leading-relaxed">
          {[...reading.content].map((char, index) => {
            if (/^[\s，。！？、；：“”"'（）\u3000]$/.test(char)) {
              return <span key={index}>{char}</span>;
            }

            return (
              <span
                key={index}
                role="button"
                tabIndex={0}
                onClick={(event) => setPopup({ char, x: event.clientX, y: event.clientY })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setPopup({ char, x: 0, y: 0 });
                  }
                }}
                className="cursor-pointer rounded hover:bg-[var(--color-gold)]/20"
              >
                {char}
              </span>
            );
          })}
        </p>
        {showPinyin ? (
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-muted)]">{reading.pinyin_text}</p>
        ) : null}
        {popup ? (
          <WordPopup
            character={popup.char}
            position={{ x: popup.x, y: popup.y }}
            onClose={() => setPopup(null)}
          />
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
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleAnswer(index, option)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      submitted && option === question.correct
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : submitted && answers[index] === option
                          ? 'border-red-500 bg-red-50 text-red-900'
                          : answers[index] === option
                            ? 'border-[var(--color-vermilion)] bg-[var(--color-surface)]'
                            : 'border-[var(--color-border)]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {!submitted && reading.questions.length > 0 ? (
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            disabled={Object.keys(answers).length < reading.questions.length}
            className="mt-4 rounded-lg bg-[var(--color-gold)] px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            Submit Answers
          </button>
        ) : null}

        {score !== null ? (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-center">
            <p className="text-lg font-semibold">{score} / {reading.questions.length}</p>
          </div>
        ) : null}
      </section>
    </article>
  );
}