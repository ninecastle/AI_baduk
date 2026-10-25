/* sw.js — 오프라인 캐시 (GitHub Pages 설치형 앱용). 앱 파일과 신경망을 미리 받아두고, 이후엔 캐시 우선 */
const VERSION = 'v4';
const CACHE = 'badukrab-' + VERSION;
const PRECACHE = [
  './', './index.html', './app.css', './app.js', './go.js', './board-view.js', './engine.worker.js', './review.js',
  './tsumego.js', './tsumego-data.js', './tsumego-ui.js', './learn.js', './learn-data.js', './sync.js', './manifest.webmanifest',
  './kata/kataboard.js', './kata/katafeatures.js', './kata/katagame.js', './kata/katanet.js', './kata/katasearch.js', './kata/kataengine.js', './kata/kata.worker.js',
  './models/b10c128.wasm',
  './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 외부(CDN·Firebase)는 네트워크 우선, 캐시 보조
  if (url.origin !== location.origin) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok && /tf\.min\.js|firebase/.test(url.href)) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // 신경망 파일(크고 잘 안 바뀜)은 캐시 우선, 나머지 앱 파일은 네트워크 우선(오프라인이면 캐시)
  if (/\/models\//.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); } return r; })));
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
