import { applySm2, SM2_FIXTURES } from './index';

for (const fixture of SM2_FIXTURES) {
  it(fixture.name, () => {
    expect(applySm2(fixture.input)).toEqual(fixture.expected);
  });
}

it.each([-1, 6, Number.NaN])('rejects quality %s', quality => {
  expect(() => applySm2({ ...SM2_FIXTURES[0].input, quality })).toThrow(
    'quality must be an integer between 0 and 5',
  );
});
