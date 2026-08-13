/* 寶可夢 TCG 抽卡機 — Service Worker 離線快取 */
const CACHE = 'ptcg-opener-v16';
const IMG_CACHE = 'ptcg-imgs-v1';
const CORE = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith('ptcg-imgs')).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 卡圖（跨域 asia.pokemon-card.com）：cache-first + 背景填充
  // → 重複瀏覽/離線都唔使再打官方 server
  if (e.request.destination === 'image') {
    e.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(e.request).then((hit) => {
          if (hit) return hit;
          return fetch(e.request).then((res) => {
            if (res && (res.ok || res.status === 0)) {
              const copy = res.clone();
              cache.put(e.request, copy).catch(() => {});
              // LRU：上限 800 張，超出刪最早
              cache.keys().then((keys) => {
                if (keys.length > 800) cache.delete(keys[0]);
              }).catch(() => {});
            }
            return res;
          }).catch(() => new Response('', { status: 408 }));
        })
      )
    );
    return;
  }
  // 只攔截同源請求；其他外部資源直接放行
  if (url.origin !== location.origin) return;
  // 導航請求：network-first，離線時 fallback cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 靜態資源：cache-first，後台更新
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetchP = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetchP;
    })
  );
});
