const CACHE_VERSION = 'mech-design-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

const CORE_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './questions.js',
    './favicon.svg',
    './manifest.webmanifest',
    './js/state.js',
    './js/storage.js',
    './js/utils.js',
    './js/icons.js',
    './js/modal.js',
    './js/questionEdits.js',
    './js/questionEditUI.js',
    './js/questionRenderer.js',
    './js/quiz.js',
    './js/ui.js',
    './js/home.js',
    './js/dashboard.js',
    './js/mechanism.js',
    './js/wallpaper.js',
    './js/wallpaperStore.js',
    './js/feedback.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith('mech-design-') && key !== APP_SHELL_CACHE && key !== CDN_CACHE)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 同源核心资源：Network-First（联网永远拿最新，离线时使用缓存兜底）
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.ok) {
                        const cloned = response.clone();
                        caches.open(APP_SHELL_CACHE).then(cache => cache.put(request, cloned));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(request);
                    if (cached) return cached;
                    if (request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return Response.error();
                })
        );
        return;
    }

    // 锁版本 CDN 脚本与字体文件：Cache-First 提升离线可用性与加载速度
    if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    if (response && (response.ok || response.type === 'opaque')) {
                        const cloned = response.clone();
                        caches.open(CDN_CACHE).then(cache => cache.put(request, cloned));
                    }
                    return response;
                });
            })
        );
    }
});
