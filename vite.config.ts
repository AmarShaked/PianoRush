/// <reference types="vitest/config" />
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { buildServiceWorker } from './src/pwa/serviceWorker';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Emits sw.js pre-caching every bundled and public file (offline-first, no extra dependencies). */
function serviceWorker(): Plugin {
  return {
    name: 'piano-rush-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicDir = join(__dirname, 'public');
      const publicFiles = listFiles(publicDir).map((f) => relative(publicDir, f).split('\\\\').join('/'));
      const files = [...Object.keys(bundle), ...publicFiles];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker(files) });
    },
  };
}

export default defineConfig({
  // Relative URLs: the build works from any path (or a plain file host).
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
