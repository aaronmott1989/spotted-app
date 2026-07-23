/* Spotted service worker — caches the app shell for offline use.
   The app document (navigations) is NETWORK-FIRST so a returning member always
   gets the latest build when online, and falls back to cache only when offline —
   this closes the "stuck on a stale app after a deploy" trap. Static assets
   (icons/manifest) stay cache-first with a background refresh for speed.
   Cross-origin requests (CDN pdf.js / tesseract.js used for plan uploads) go
   straight to the network so offline mode never blocks them. Bump CACHE to
   invalidate. */
var CACHE = "spotted-v4";
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

  // The app document: NETWORK-FIRST. Always try the live app when online so a
  // deploy is picked up immediately; fall back to the cached shell only offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/spotted-app.html")) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("./spotted-app.html");
        });
      })
    );
    return;
  }

  // Everything else same-origin (icons/manifest): cache-first + background refresh.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
