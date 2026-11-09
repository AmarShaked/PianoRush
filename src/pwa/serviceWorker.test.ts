import { describe, expect, it } from 'vitest';
import { buildServiceWorker, cacheVersion, SAMPLE_CACHE } from './serviceWorker';

describe('service worker generator', () => {
  const files = ['assets/index-abc.js', 'assets/GameRenderer-def.js', 'assets/index-123.css', 'manifest.webmanifest', 'icons/icon-192.png'];
  const sw = buildServiceWorker(files);

  it('pre-caches the app shell and every built file', () => {
    for (const f of ['./', 'index.html', ...files]) expect(sw).toContain(JSON.stringify(f));
  });

  it('does not pre-cache itself', () => {
    expect(buildServiceWorker([...files, 'sw.js'])).not.toContain('"sw.js"');
  });

  it('versions the cache by content (file names are hashed by the build)', () => {
    expect(cacheVersion(files)).toBe(cacheVersion([...files].reverse()));
    expect(cacheVersion(files)).not.toBe(cacheVersion([...files, 'assets/new-999.js']));
    expect(sw).toContain(`piano-rush-${cacheVersion(['./', 'index.html', ...files])}`);
  });

  it('leaves the piano samples out of the install pre-cache (downloaded on first use)', () => {
    const withSamples = buildServiceWorker([...files, 'samples/salamander/60v11.mp3', 'samples/salamander/README.txt']);
    expect(withSamples).not.toContain('samples/salamander/60v11.mp3');
    expect(withSamples).toContain(`'${SAMPLE_CACHE}'`);
  });

  it('is valid JavaScript', () => {
    expect(() => new Function(sw)).not.toThrow();
  });
});
