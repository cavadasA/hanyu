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

  it('no promete una selección manual de unidad ni pide una acción imposible', () => {
    expect(unavailableToText('unit_unavailable', 'new_items')).toBe(
      'No hay una unidad disponible para introducir palabras nuevas ahora',
    );
    expect(unavailableToText('no_exam_date', 'exam')).toBe(
      'Añade una fecha de examen en tu perfil para activar este formato',
    );
  });
});
