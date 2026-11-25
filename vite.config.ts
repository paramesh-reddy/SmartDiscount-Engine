import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rootDir, 'frontend'),
  appType: 'spa',
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    root: rootDir,
    include: ['tests/**/*.test.ts'],
  },
});
