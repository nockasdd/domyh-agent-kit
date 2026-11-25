import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/headless.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  dts: false,
  sourcemap: true,
});
