/* DrugBug service worker (PRD §14). Handles Web Push display + notification
   clicks + a minimal offline app-shell cache. Dose reminders, predicted-miss
   nudges, refill/recall/caregiver alerts are delivered as push messages whose
   payload is a JSON { title, body, url, tag }. */

const SHELL_CACHE = "drugbug-shell-v1";
const SHELL = ["/", "/today", "/manifest.webmanifest", "/icons/drugbug-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "DrugBug", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "DrugBug";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      data: { url: data.url || "/today" },
      icon: "/icons/drugbug-192.png",
      badge: "/icons/drugbug-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

/* Network-first for navigations, falling back to cached shell when offline. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/today").then((r) => r || caches.match("/"))));
  }
});
