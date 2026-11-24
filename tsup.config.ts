import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  // Keep heavy/native deps external so their dynamic import() works at runtime.
  external: ['playwright', 'lighthouse'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
