import { reasonToText, unavailableToText } from './planCopy';

describe('planCopy', () => {
  it('traduce una razón de refuerzo con su cantidad', () => {
    expect(reasonToText({ kind: 'reinforces_targets', count: 6 })).toBe(
      'Refuerza 6 palabras que estás aprendiendo',
    );
  });

  it('traduce un hueco de lecturas como información visible', () => {
    expect(unavailableToText('no_content', 'reading')).toBe(
      'Todavía no hay lecturas disponibles',
    );
  });
});
