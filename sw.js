const CACHE = "koltseg-v1";
const ASSETS = [
  ".", "index.html", "styles.css", "manifest.webmanifest",
  "src/app.js", "src/ui.js", "src/model.js", "src/storage.js", "src/codec.js",
  "src/csv.js", "src/ics.js", "src/theme.js",
  "icons/icon-192.png", "icons/icon-512.png",
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match("index.html"))));
});
