/* Arabic Learn v9 — network-first shell; progress lives in localStorage + cloud sync (not SW caches) */
const CACHE_NAME = "arabic-learn-v9";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/speech.js",
  "./js/progress.js",
  "./js/srs.js",
  "./js/cloud-sync.js",
  "./js/engine.js",
  "./js/conversation.js",
  "./js/app.js",
  "./data/meta.js",
  "./data/files.js",
  "./data/curriculum.js",
  "./data/conversations.js",
  "./data/grammar.js",
  "./audio/manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          // Never delete a dedicated progress cache if we ever add one
          .filter((k) => !/-progress-/i.test(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isShellAsset(pathname) {
  return (
    /\/(js|css)\//.test(pathname) ||
    /\.(js|css|webmanifest|html)$/.test(pathname) ||
    pathname.endsWith("/") ||
    pathname.endsWith("/sw.js")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for shell / JS / CSS so updates land without «clear site data»
  if (req.mode === "navigate" || isShellAsset(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((c) => c || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (
          res &&
          res.ok &&
          (url.pathname.includes("/data/") ||
            url.pathname.includes("/audio/") ||
            url.pathname.includes("/icons/"))
        ) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});
