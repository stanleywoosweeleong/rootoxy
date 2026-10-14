/* RootOxy service worker — no version to bump.
   index.html is fetched network-first on every launch; if it differs from the cached copy,
   the cache is refreshed and every open page is told so it can show "updated to vX". */
const CACHE = "rootoxy-core";
const CORE = ["./", "./index.html", "./manifest.json", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function isIndex(req) {
  if (req.mode === "navigate") return true;
  const u = new URL(req.url);
  return u.origin === location.origin && (u.pathname.endsWith("/") || u.pathname.endsWith("/index.html"));
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (isIndex(e.request)) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).then(async res => {
        if (!res.ok) throw new Error("bad status");
        const fresh = res.clone();
        const cache = await caches.open(CACHE);
        const old = await cache.match("./index.html");
        const [newText, oldText] = await Promise.all([fresh.text(), old ? old.clone().text() : Promise.resolve(null)]);
        await cache.put("./index.html", new Response(newText, { headers: res.headers }));
        await cache.put("./", new Response(newText, { headers: res.headers }));
        if (oldText !== null && oldText !== newText) {
          const m = newText.match(/APP_VER\s*=\s*"([^"]+)"/);
          const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
          clients.forEach(cl => cl.postMessage({ type: "updated", version: m ? m[1] : "" }));
        }
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }
  // other files: cache first, refresh in the background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; }).catch(() => cached);
      return cached || net;
    })
  );
});
