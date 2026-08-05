const CACHE = "koltseg-v57";
const ASSETS = [
  ".", "index.html", "styles.css", "manifest.webmanifest",
  "src/app.js", "src/ui.js", "src/model.js", "src/storage.js", "src/codec.js",
  "src/xlsx.js", "src/ics.js", "src/theme.js", "src/dialog.js", "src/version.js",
  "icons/icon-192.png?v=2", "icons/icon-512.png?v=2",
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: "reload" }))))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("message", e => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match("index.html"))));
});
