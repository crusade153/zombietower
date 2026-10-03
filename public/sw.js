// 앱 셸 캐시 (stale-while-revalidate): 오프라인에서도 실행되고, 새 버전은 다음 실행 때 반영된다.
const CACHE = 'zombie-tower-ipad-v4';

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
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req)
        .then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
