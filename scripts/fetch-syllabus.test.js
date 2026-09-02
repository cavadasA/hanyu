import { loadManifest, verifyLocalSources } from './fetch-syllabus.js';

describe('manifiesto del sílabo', () => {
  const manifest = loadManifest();

  it('declara las doce fuentes de los niveles 1 a 3', () => {
    expect(manifest).toHaveLength(12);
  });

  it('fija revisión y suma para cada fuente', () => {
    for (const entry of manifest) {
      expect(entry.id).toBeTruthy();
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.path).toMatch(/^data\//);
    }
  });

  it('las fuentes locales coinciden con el manifiesto', () => {
    const bad = verifyLocalSources().filter((entry) => entry.status !== 'ok');

    expect(bad).toEqual([]);
  });
});
