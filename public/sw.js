const APP_SHELL_CACHE = "nightvibe-app-shell-v1";
const APP_SHELL_ROUTES = ["/", "/explore", "/vibe-check", "/profile"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ROUTES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== APP_SHELL_CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isAppShellRoute(request, url)) return;

  event.respondWith(cacheFirstAppShell(request, url.pathname));
});

function isAppShellRoute(request, url) {
  if (url.origin !== location.origin) return false;
  if (!APP_SHELL_ROUTES.includes(url.pathname)) return false;
  return request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
}

async function cacheFirstAppShell(request, pathname) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(pathname);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(pathname, response.clone());
  }
  return response;
}

self.addEventListener("push", (event) => {
  const fallback = { title: "NightVibe", body: "Friday night picks are ready.", url: "/" };
  let payload = fallback;
  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || fallback.title, {
      body: payload.body || fallback.body,
      icon: "/icon-192.png",
      data: { url: payload.url || fallback.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
