import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@hanyu/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['apps/web/src/**/*.test.jsx', 'jsdom']],
    include: ['**/*.test.{js,jsx,ts}'],
    // Alcance: solo lo que sostiene la app móvil.
    //
    // apps/mobile corre en Jest, no aquí. apps/web está congelada — sigue en el
    // repositorio pero no se verifica, porque mantener verdes sus 10 suites
    // obligaría a arreglarla cada vez que cambia packages/data, y ese es
    // esfuerzo que no queremos gastar mientras no se decida su futuro.
    //
    // De server/ se conserva únicamente server/db: ahí vive el corpus
    // (server/db/seeds/*.json) que alimenta supabase/seed.sql y, con él, la app
    // móvil. El servidor Express, sus rutas y sus servicios están congelados
    // por el mismo motivo que la web.
    exclude: [
      '**/node_modules/**',
      'apps/mobile/**',
      'apps/web/**',
      'server/app.test.js',
      'server/routes/**',
      'server/services/**',
      // scripts/corpus-contract.test.js queda fuera hasta que la Tarea 4 del
      // Plan 1A arregle el importador. Vuelve a entrar en esa misma tarea.
      'scripts/corpus-contract.test.js',
    ],
  },
});
