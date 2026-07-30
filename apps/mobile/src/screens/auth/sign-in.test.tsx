import { fireEvent, render, screen } from '@testing-library/react-native';
import SignIn from '../../../app/(auth)/sign-in';

const mockSignIn = jest.fn();

jest.mock('../../lib/data', () => ({
  getData: () => ({ auth: { signIn: (input: unknown) => mockSignIn(input as never) } }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');

  return {
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('SignIn', () => {
  beforeEach(() => mockSignIn.mockReset());

  it('submits trimmed credentials', async () => {
    mockSignIn.mockResolvedValue({});

    await render(<SignIn />);
    await fireEvent.changeText(screen.getByLabelText('Email'), '  learner@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByText('Sign in'));

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'learner@example.com',
      password: 'secret123',
    });
  });

  it('shows a readable error when sign in fails', async () => {
    mockSignIn.mockRejectedValue({ status: 400, message: 'Invalid login credentials' });

    await render(<SignIn />);
    await fireEvent.press(screen.getByText('Sign in'));

    expect(screen.getByText('Invalid login credentials')).toBeTruthy();
  });
});
