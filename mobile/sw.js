// Bump this on every deploy of mobile/js/* or the shared js/* files it
// loads — there's no build step to hash filenames automatically, so this is
// the one manual step that busts the cache.
const SHELL_CACHE = "pf-mobile-shell-v7";

const PRECACHE_URLS = [
  "./index.html",
  "./manifest.json",
  "./css/mobile.css",
  "./js/pending-queue.js",
  "./js/local-mirror.js",
  "./js/drive-auth.js",
  "./js/drive-api.js",
  "./js/drive-picker.js",
  "./js/setup.js",
  "./js/sync.js",
  "./js/mobile-app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "../js/state.js",
  "../js/accounts.js",
  "../js/loans.js",
  "../js/categories.js",
  "../js/cards.js",
  "../js/transactions.js",
  "../js/ui/common.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  // Never intercept Google auth/Drive traffic — these must always hit the
  // network directly, unaffected by any caching behavior here.
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("accounts.google.com")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
