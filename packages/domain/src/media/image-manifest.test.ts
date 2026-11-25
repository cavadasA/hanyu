import { validateImageManifest, type ImageManifest } from './manifest.ts';

const manifest = (overrides: Partial<ImageManifest['images'][number]> = {}): ImageManifest => ({
  owner: 'exam/hsk2/A',
  images: [
    {
      key: 'l1-01-a',
      file: 'l1-01-a.webp',
      depicts_es: 'un chico bebe agua',
      source: 'svg-propio',
      license: 'CC0, dibujo propio',
      ...overrides,
    },
  ],
});
const sizes = (bytes: number) => ({ fileSize: () => bytes });

describe('validateImageManifest', () => {
  it('un manifiesto completo y una imagen de 40 KB → []', () => {
    expect(validateImageManifest(manifest(), sizes(40_000))).toEqual([]);
  });

  it("license: '' → license_missing", () => {
    expect(validateImageManifest(manifest({ license: '' }), sizes(40_000))).toEqual([
      { kind: 'license_missing', key: 'l1-01-a' },
    ]);
  });

  it('una imagen de más de 80 KB → image_too_large', () => {
    expect(validateImageManifest(manifest(), sizes(80 * 1024 + 1))).toEqual([
      { kind: 'image_too_large', key: 'l1-01-a' },
    ]);
  });

  it('sin fichero → file_missing', () => {
    expect(validateImageManifest(manifest(), { fileSize: () => null })).toEqual([
      { kind: 'file_missing', key: 'l1-01-a' },
    ]);
  });

  it('una imagen que no es .webp, sin source o sin depicts_es se rechaza', () => {
    const kinds = (overrides: Partial<ImageManifest['images'][number]>) =>
      validateImageManifest(manifest(overrides), sizes(1000)).map(issue => issue.kind);
    expect(kinds({ file: 'l1-01-a.png' })).toEqual(['image_format']);
    expect(kinds({ source: ' ' })).toEqual(['source_missing']);
    expect(kinds({ depicts_es: '' })).toEqual(['depicts_missing']);
  });

  it('dos imágenes con la misma clave → duplicate_key', () => {
    const doubled = manifest();
    doubled.images.push({ ...doubled.images[0] });
    expect(validateImageManifest(doubled, sizes(1000))).toEqual([{ kind: 'duplicate_key', key: 'l1-01-a' }]);
  });
});
