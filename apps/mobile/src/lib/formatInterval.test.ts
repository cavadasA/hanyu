import { formatInterval } from './formatInterval';

describe('formatInterval', () => {
  it.each([
    [0, '1m'],
    [10, '10m'],
    [90, '2h'],
    [1440, '1d'],
    [45 * 1440, '2mo'],
    [365 * 1440, '1.0y'],
  ])('formats %s minutes as %s', (minutes, expected) => {
    expect(formatInterval(minutes)).toBe(expected);
  });
});
