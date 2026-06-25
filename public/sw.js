const RUNTIME_CACHE = "nightvibe-v1";
const OFFLINE_URL = "/offline";
const STATIC_URLS = ["/", "/map", "/explore", OFFLINE_URL];
const CACHE_FIRST_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cartocdn.com"];
const VENUE_DETAIL_TIMEOUT_MS = 5000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.addAll(STATIC_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== RUNTIME_CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;

  if (isVenueListRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isVenueDetailRequest(url)) {
    event.respondWith(networkFirst(request, VENUE_DETAIL_TIMEOUT_MS));
    return;
  }

  if (isCacheFirstAsset(request, url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin !== location.origin) return;

  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const staticAsset = ["script", "style"].includes(request.destination);
  if (acceptsHtml || staticAsset) {
    event.respondWith(handleDocumentOrStaticRequest(request, acceptsHtml));
  }
});

function isVenueListRequest(url) {
  return url.origin === location.origin && url.pathname === "/api/venues";
}

function isVenueDetailRequest(url) {
  if (url.origin !== location.origin) return false;
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.length === 3 && segments[0] === "api" && segments[1] === "venues";
}

function isCacheFirstAsset(request, url) {
  if (!["font", "image"].includes(request.destination)) return false;
  return CACHE_FIRST_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const refresh = fetchAndCache(request, cache).catch(() => undefined);
  if (cached) return cached;
  return (await refresh) || Response.error();
}

async function networkFirst(request, timeoutMs) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    return await fetchWithTimeout(request, timeoutMs).then((response) => putAndReturn(cache, request, response));
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  return cached || fetchAndCache(request, cache);
}

async function fetchAndCache(request, cachePromise) {
  const cache = cachePromise || (await caches.open(RUNTIME_CACHE));
  const response = await fetch(request);
  return putAndReturn(cache, request, response);
}

async function handleDocumentOrStaticRequest(request, acceptsHtml) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    return await fetchAndCache(request);
  } catch (error) {
    if (acceptsHtml) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw error;
  }
}

async function putAndReturn(cache, request, response) {
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Network timeout")), timeoutMs);
    fetch(request).then(
      (response) => {
        clearTimeout(timeout);
        resolve(response);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
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
