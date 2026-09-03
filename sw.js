const CACHE_NAME = 'travel-fx-cache-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// Installazione: Cache iniziale degli asset statici
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Attivazione: Pulizia vecchie cache
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch: Strategia Stale-While-Revalidate per i file locali
self.addEventListener('fetch', event => {
    // Ignora le richieste alle API esterne per non metterle in cache locale permanentemente 
    // (le gestiamo tramite localStorage in app.js)
    if (event.request.url.includes('api.frankfurter.app')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                // Avvia comunque fetch in background per aggiornare la cache
                fetch(event.request).then(networkResponse => {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse);
                    });
                }).catch(() => {}); // Ignora errori network se offline
                return cachedResponse;
            }
            return fetch(event.request);
        })
    );
});