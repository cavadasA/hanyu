import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppErrorBoundary } from './AppErrorBoundary';

describe('AppErrorBoundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the fallback UI and logs the full error to the console', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    function Bomb(): never {
      throw new Error('boom');
    }

    await render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Algo ha fallado')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    // The Error object itself must be passed to console.error so Hermes
    // serializes the full stack into the Metro terminal log.
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
  });

  it('recovers when "Reintentar" is pressed after the error source is fixed', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;

    function MaybeBomb() {
      if (shouldThrow) {
        throw new Error('boom');
      }
      return <Text>recovered</Text>;
    }

    await render(
      <AppErrorBoundary>
        <MaybeBomb />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('boom')).toBeTruthy();

    shouldThrow = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    expect(screen.getByText('recovered')).toBeTruthy();
    // The boundary logs the Error object itself (full stack in Metro); the
    // exact call count is not asserted here because React 19 also logs the
    // caught error through its own dev channels.
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
  });
});
