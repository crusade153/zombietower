// Fresh HTML online keeps hashed build assets in sync; cached content works offline.
const CACHE = 'zombie-tower-ipad-v6';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.startsWith('/audio/')) {
    // Cache a complete track on first play; Safari's range requests also work offline.
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      let full = await cache.match(req.url);
      if (!full) {
        full = await fetch(req.url);
        if (!full.ok || full.status !== 200) return full;
        await cache.put(req.url, full.clone());
      }
      const header = req.headers.get('range');
      if (!header) return full;
      const body = await full.arrayBuffer();
      const range = /^bytes=(\d*)-(\d*)$/.exec(header);
      let start = range && range[1] ? Number(range[1]) : 0;
      let end = range && range[2] ? Number(range[2]) : body.byteLength - 1;
      if (range && !range[1] && range[2]) { start = Math.max(0, body.byteLength - Number(range[2])); end = body.byteLength - 1; }
      end = Math.min(end, body.byteLength - 1);
      if (!range || (!range[1] && !range[2]) || start > end || start >= body.byteLength) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.byteLength}` } });
      }
      return new Response(body.slice(start, end + 1), { status: 206, headers: {
        'Content-Type': full.headers.get('content-type') || 'audio/mpeg',
        'Content-Range': `bytes ${start}-${end}/${body.byteLength}`,
        'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes',
      } });
    }));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (req.mode === 'navigate') {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) { await c.put(req, fresh.clone()); return fresh; }
        } catch { /* Use the saved app shell while offline. */ }
        return hit || Response.error();
      }
      if (hit) return hit;
      return fetch(req)
        .then(async (r) => { if (r && r.ok && r.status === 200) await c.put(req, r.clone()); return r; })
        .catch(() => Response.error());
    }),
  );
});
