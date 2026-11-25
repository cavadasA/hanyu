import { describe, expect, it } from 'vitest';
import { imageKeysOf, imageManifestFor } from './render-exam-images.js';

const form = {
  code: 'A',
  level: 2,
  groups: [
    { slug: 'a-l1', part: 'L1', example: { images: ['plane', 'train', 'bike'] }, items: [{ images: ['tea', 'coffee', 'milk'] }] },
    { slug: 'a-l2', part: 'L2', images: ['phone', 'tea'], items: [] },
    { slug: 'a-r2', part: 'R2', bank: [], items: [] },
  ],
};

describe('render-exam-images', () => {
  it('reúne las imágenes de la forma, ejemplos incluidos, sin repetir', () => {
    expect(imageKeysOf(form)).toEqual(['bike', 'coffee', 'milk', 'phone', 'plane', 'tea', 'train']);
  });

  it('el manifiesto declara qué muestra cada imagen, que es un dibujo propio y su licencia', () => {
    const manifest = imageManifestFor(form, { tea: 'una tetera', phone: 'un móvil' }, ['phone', 'tea']);
    expect(manifest).toEqual({
      owner: 'exam/hsk2/A',
      images: [
        { key: 'phone', file: 'phone.webp', depicts_es: 'un móvil', source: 'svg-propio', license: expect.stringMatching(/propio/) },
        { key: 'tea', file: 'tea.webp', depicts_es: 'una tetera', source: 'svg-propio', license: expect.stringMatching(/propio/) },
      ],
    });
  });

  it('un dibujo sin descripción en el catálogo no entra', () => {
    expect(() => imageManifestFor(form, {}, ['tea'])).toThrow(/tea/);
  });
});
