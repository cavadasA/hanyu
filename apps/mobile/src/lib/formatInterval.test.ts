import { formatInterval } from './formatInterval';

describe('formatInterval', () => {
  it.each([
    [0, '1 min'],
    [10, '10 min'],
    [90, '2 h'],
    [1440, '1 d'],
    [45 * 1440, '2 meses'],
    [365 * 1440, '1,0 años'],
  ])('formats %s minutes as %s', (minutes, expected) => {
    expect(formatInterval(minutes)).toBe(expected);
  });
});
