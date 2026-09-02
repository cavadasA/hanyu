import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));

describe('imports del evaluador compatibles con Deno', () => {
  it('declara extensión .ts en cada import relativo del módulo', () => {
    const imports = [
      ['normalize.ts', "from '../pinyin.ts'"],
      ['evaluate.ts', "from './contract.ts'"],
      ['evaluate.ts', "from './normalize.ts'"],
    ] as const;

    for (const [file, importStatement] of imports) {
      const source = readFileSync(resolve(directory, file), 'utf8');
      expect(source).toContain(importStatement);
    }
  });
});
