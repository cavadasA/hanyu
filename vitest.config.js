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
    setupFiles: ['./test/setup-web.js'],
    include: ['**/*.test.{js,jsx,ts}'],
    exclude: ['**/node_modules/**', 'apps/mobile/**'],
  },
});