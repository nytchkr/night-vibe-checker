const CACHE = "nightvibe-v1";
const SHELL = ["/", "/login", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const staticAsset = ["script", "style"].includes(request.destination);
  if (acceptsHtml || staticAsset) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
