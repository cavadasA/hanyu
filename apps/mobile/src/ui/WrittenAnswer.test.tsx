import { fireEvent, render, screen } from '@testing-library/react-native';
import { WrittenAnswer } from './WrittenAnswer';

describe('WrittenAnswer', () => {
  it('valora la respuesta correcta sin pedir autoevaluación', async () => {
    const onGraded = jest.fn();
    await render(<WrittenAnswer expected="你好" kind="hanzi" onGraded={onGraded} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你好');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true }),
    );
  });

  it('muestra la respuesta esperada cuando se falla', async () => {
    await render(<WrittenAnswer expected="你好" kind="hanzi" onGraded={jest.fn()} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你号');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByText('你好')).toBeTruthy();
  });

  it('cuenta la pista y la nota baja por ello', async () => {
    const onGraded = jest.fn();
    await render(<WrittenAnswer expected="你好" kind="hanzi" onGraded={onGraded} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Show a hint' }));
    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你好');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ reason: 'hint', hints: 1 }));
  });

  it('deja corregir la valoración a mano', async () => {
    // Teclear mal algo que sí se sabe no debe costar un intervalo entero.
    const onGraded = jest.fn();
    await render(<WrittenAnswer expected="你好" kind="hanzi" onGraded={onGraded} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你号');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await fireEvent.press(screen.getByRole('button', { name: 'I actually knew it' }));

    expect(onGraded).toHaveBeenLastCalledWith(
      expect.objectContaining({ grade: 'hard', correct: true }),
    );
  });
});
