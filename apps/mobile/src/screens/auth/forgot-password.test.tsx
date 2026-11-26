import { fireEvent, render, screen } from '@testing-library/react-native';
import ForgotPassword from '../../../app/(auth)/forgot-password';

const mockSendPasswordReset = jest.fn();

jest.mock('../../lib/data', () => ({
  getData: () => ({
    auth: {
      sendPasswordReset: (email: string) => mockSendPasswordReset(email),
    },
  }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');

  return {
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('ForgotPassword', () => {
  beforeEach(() => mockSendPasswordReset.mockReset());

  it('sends the reset request and confirms delivery', async () => {
    mockSendPasswordReset.mockResolvedValue(undefined);

    await render(<ForgotPassword />);
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), ' learner@example.com ');
    await fireEvent.press(screen.getByText('Enviar enlace'));

    expect(mockSendPasswordReset).toHaveBeenCalledWith('learner@example.com');
    expect(screen.getByText(/Revisa tu correo/)).toBeTruthy();
  });
});
