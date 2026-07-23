/* Spotted service worker — caches the app shell for offline use.
   Same-origin GETs are cache-first with a background refresh; cross-origin
   requests (CDN pdf.js / tesseract.js used for plan uploads) go straight to
   the network so offline mode never blocks them. Bump CACHE to invalidate. */
var CACHE = "spotted-v3";
var ASSETS = [
  "./spotted-app.html",
  "./manifest.webmanifest",
  "./spotted-icon.svg",
  "./spotted-icon-192.png",
  "./spotted-icon-512.png",
  "./spotted-icon-maskable-512.png"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Add individually so one missing asset can't fail the whole cache.
      return Promise.all(ASSETS.map(function (a) { return c.add(a).catch(function () {}); }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return; // let CDN scripts hit the network directly

  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // offline: fall back to cache, and for navigations serve the app shell
        return hit || (req.mode === "navigate" ? caches.match("./spotted-app.html") : undefined);
      });
      return hit || net;
    })
  );
});
