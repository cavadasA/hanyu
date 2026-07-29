const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function splitOption(rawOption, index) {
  const fallbackId = OPTION_IDS[index] || String(index + 1);
  const text = cleanText(rawOption);
  const match = text.match(/^([A-Fa-f])[\s.．、:：-]+(.+)$/);

  if (!match) {
    return { id: fallbackId, text };
  }

  return { id: match[1].toUpperCase(), text: cleanText(match[2]) };
}

export function normalizeReadingQuestion(rawQuestion, index = 0) {
  const id = rawQuestion.id || `q${index}`;
  const rawOptions = Array.isArray(rawQuestion.options) ? rawQuestion.options : [];
  const options = rawOptions.map((option, optionIndex) => {
    if (typeof option === 'object' && option !== null) {
      return {
        id: cleanText(option.id || OPTION_IDS[optionIndex] || String(optionIndex + 1)).toUpperCase(),
        text: cleanText(option.text),
      };
    }

    return splitOption(option, optionIndex);
  });

  const rawCorrect = cleanText(rawQuestion.correct_option_id || rawQuestion.correct).replace(/[.．、:：-]$/, '');
  const letterMatch = rawCorrect.match(/^[A-Fa-f]$/);
  const correctByText = options.find((option) => option.text === rawCorrect || `${option.id}. ${option.text}` === rawCorrect);

  return {
    id,
    question: cleanText(rawQuestion.question),
    options,
    correct_option_id: letterMatch ? rawCorrect.toUpperCase() : correctByText?.id || rawCorrect,
  };
}

export function normalizeReadingQuestions(questions = []) {
  return questions.map((question, index) => normalizeReadingQuestion(question, index));
}

export function scoreReadingAnswers(questions, answersByQuestionId = {}) {
  const normalizedQuestions = normalizeReadingQuestions(questions);
  const results = normalizedQuestions.map((question) => {
    const selected = cleanText(answersByQuestionId[question.id]).toUpperCase();
    return {
      question_id: question.id,
      selected_option_id: selected,
      correct_option_id: question.correct_option_id,
      correct: selected === question.correct_option_id,
    };
  });

  return {
    score: results.filter((result) => result.correct).length,
    total: normalizedQuestions.length,
    results,
  };
}
