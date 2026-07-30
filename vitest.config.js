import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['apps/web/src/**/*.test.jsx', 'jsdom']],
    setupFiles: [],
    include: ['**/*.test.{js,jsx,ts}'],
    exclude: ['**/node_modules/**', 'apps/mobile/**'],
  },
});