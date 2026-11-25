import { render, screen } from '@testing-library/react-native';
import type { ReadingQuestion, ReadingResult } from '@hanyu/data';
import { ReadingQuestions } from './ReadingQuestions';

const questions: ReadingQuestion[] = [
  { id: 'q0', prompt: '¿A qué hora se levanta?', options: [{ id: '0', text: '六点' }, { id: '1', text: '七点' }] },
  { id: 'q1', prompt: '¿Dónde come al mediodía?', options: [{ id: '0', text: '学校' }, { id: '1', text: '家里' }] },
];

const rationale = 'Su madre hace la comida y él vuelve a casa a mediodía: come en casa.';

const result: ReadingResult = {
  score: 2,
  total: 2,
  results: [
    { question_id: 'q0', selected_option_id: '0', correct_option_id: '0', correct: true, kind: 'literal' },
    { question_id: 'q1', selected_option_id: '1', correct_option_id: '1', correct: true, kind: 'inferential', rationale_es: rationale },
  ],
};

describe('ReadingQuestions', () => {
  it('después de responder, muestra la explicación de la pregunta inferencial', async () => {
    await render(<ReadingQuestions questions={questions} answers={{ q0: '0', q1: '1' }} disabled result={result} onAnswer={jest.fn()} />);

    expect(screen.getByText(rationale)).toBeTruthy();
  });

  it('antes de responder no muestra la explicación', async () => {
    await render(<ReadingQuestions questions={questions} answers={{}} disabled={false} result={null} onAnswer={jest.fn()} />);

    expect(screen.queryByText(rationale)).toBeNull();
  });
});
