/**
 * Generates the service worker source at build time (see vite.config.ts).
 *
 * Offline-first (PRD §15): every built file is pre-cached on install, so after
 * one online visit the whole game — code, styles, icons and all songs (they
 * are bundled; backing tracks are synthesized) — works without a network.
 *  - Hashed assets: cache-first (they never change), matched ignoring Vary.
 *  - Page navigations: network-first so updates arrive when online, falling
 *    back to the cached app shell when offline.
 *  - Piano samples (samples/…, several MB) are NOT pre-cached: they are only
 *    downloaded when the sampled piano is used, then kept in their own cache
 *    that survives app updates (the files never change; a new sample set gets
 *    a new SAMPLE_CACHE name).
 * The cache name is derived from the file list, so a new build replaces the
 * old cache on activation.
 */

/** Large optional downloads, cached on first use instead of on install. */
export const isLazyAsset = (path: string) => path.startsWith('samples/');
export const SAMPLE_CACHE = 'pr-samples-v1';
export function cacheVersion(files: readonly string[]): string {
  let h = 2166136261;
  for (const ch of [...files].sort().join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

export function buildServiceWorker(files: readonly string[]): string {
  const precache = ['./', 'index.html', ...files.filter((f) => f !== 'index.html' && f !== 'sw.js' && !isLazyAsset(f))];
  return `/* Piano Rush service worker — generated at build time. */
const CACHE = 'piano-rush-${cacheVersion(precache)}';
const PRECACHE = ${JSON.stringify(precache)};
const SAMPLES = '${SAMPLE_CACHE}';
const url = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(url))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('piano-rush-') && k !== CACHE) || (k.startsWith('pr-samples-') && k !== SAMPLES)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(url('index.html'), copy));
          return res;
        })
        .catch(() => caches.match(url('index.html'), { ignoreVary: true })),
    );
    return;
  }
  if (req.url.startsWith(url('samples/'))) {
    // Piano samples: cache-first in their own long-lived cache.
    event.respondWith(
      caches.open(SAMPLES).then((cache) => cache.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }))),
    );
    return;
  }
  event.respondWith(
    // ignoreVary: module scripts are requested with an Origin header that the
    // pre-cache requests didn't have; same-origin hashed files are identical anyway.
    caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, copy)); }
      return res;
    })),
  );
});
`;
}
