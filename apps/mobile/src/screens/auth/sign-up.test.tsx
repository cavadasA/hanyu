import { fireEvent, render, screen } from '@testing-library/react-native';
import SignUp from '../../../app/(auth)/sign-up';

const mockSignUp = jest.fn();

jest.mock('../../lib/data', () => ({
  getData: () => ({ auth: { signUp: (input: unknown) => mockSignUp(input as never) } }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');

  return {
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('SignUp', () => {
  beforeEach(() => mockSignUp.mockReset());

  it('submits trimmed credentials', async () => {
    mockSignUp.mockResolvedValue({ session: null });

    await render(<SignUp />);
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), ' learner@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'secret123');
    await fireEvent.press(screen.getByText('Crear cuenta'));

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      password: 'secret123',
    });
    expect(screen.getByText(/Revisa tu correo/)).toBeTruthy();
  });
});
