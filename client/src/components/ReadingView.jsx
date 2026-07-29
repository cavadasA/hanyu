import { useState } from 'react';
import { api } from '../services/api';
import AudioButton from './AudioButton';
import PinyinToggle from './PinyinToggle';
import WordPopup from './WordPopup';

export default function ReadingView({ reading }) {
  const [showPinyin, setShowPinyin] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [scoreResult, setScoreResult] = useState(null);
  const [popup, setPopup] = useState(null);

  function handleAnswer(questionId, optionId) {
    if (submitted) {
      return;
    }

    setAnswers((current) => ({
      ...current,
      [questionId]: optionId,
    }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError('');

    try {
      const result = await api.completeReading(reading.id, answers);
      setScoreResult(result);
      setSubmitted(true);
    } catch (error) {
      console.error('Failed to complete reading:', error);
      setSubmitError('Failed to submit answers. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const score = scoreResult ? scoreResult.score : null;
  const totalQuestions = reading.questions ? reading.questions.length : 0;

  const tokens = reading.tokens || [...reading.content].map((char, index) => ({
    id: `legacy-${index}`,
    text: char,
    type: /^[\s，。！？、；：“”"'（）\u3000]$/.test(char) ? 'punctuation' : 'unknown',
  }));

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
          {tokens.map((token) => {
            if (token.type === 'punctuation' || token.type === 'text') {
              return <span key={token.id}>{token.text}</span>;
            }

            return (
              <span
                key={token.id}
                role="button"
                tabIndex={0}
                onClick={(event) => setPopup({ token, x: event.clientX, y: event.clientY })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setPopup({ token, x: 0, y: 0 });
                  }
                }}
                className="cursor-pointer rounded hover:bg-[var(--color-gold)]/20"
              >
                {token.text}
              </span>
            );
          })}
        </p>
        {showPinyin ? (
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-muted)]">{reading.pinyin_text}</p>
        ) : null}
        {popup ? (
          <WordPopup
            token={popup.token}
            position={{ x: popup.x, y: popup.y }}
            onClose={() => setPopup(null)}
          />
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold">Comprehension</h2>
        <div className="space-y-4">
          {reading.questions.map((question, index) => {
            const qId = question.id || `q${index}`;
            const options = Array.isArray(question.options) ? question.options : [];
            const resultForQ = scoreResult?.results?.find((r) => r.question_id === qId);
            const correctOptId = resultForQ ? resultForQ.correct_option_id : (question.correct_option_id || question.correct);

            return (
              <div key={qId} className="rounded-xl bg-[var(--color-bg)] p-4">
                <p className="mb-3 font-medium">{question.question}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {options.map((option, optionIndex) => {
                    const optId = typeof option === 'object' && option !== null ? option.id : option;
                    const optText = typeof option === 'object' && option !== null ? option.text : option;
                    const isSelected = answers[qId] === optId;
                    const isCorrect = submitted && optId === correctOptId;

                    return (
                      <button
                        key={optId || optionIndex}
                        type="button"
                        onClick={() => handleAnswer(qId, optId)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm ${
                          submitted && isCorrect
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                            : submitted && isSelected
                              ? 'border-red-500 bg-red-50 text-red-900'
                              : isSelected
                                ? 'border-[var(--color-vermilion)] bg-[var(--color-surface)]'
                                : 'border-[var(--color-border)]'
                        }`}
                      >
                        {optText}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {!submitted && totalQuestions > 0 ? (
          <div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || Object.keys(answers).length < totalQuestions}
              className="mt-4 rounded-lg bg-[var(--color-gold)] px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Answers'}
            </button>
            {submitError ? (
              <p className="mt-2 text-sm text-red-600">{submitError}</p>
            ) : null}
          </div>
        ) : null}

        {submitted && score !== null ? (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-center">
            <p className="text-lg font-semibold">{score} / {totalQuestions}</p>
          </div>
        ) : null}
      </section>
    </article>
  );
}