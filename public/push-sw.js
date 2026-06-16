// LMU Danmark — Web Push service worker
// Messaging-only (no app-shell caching). Safe to coexist with Lovable preview.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "LMU Danmark", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "LMU Danmark";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/beskeder" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/beskeder";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        try {
          const u = new URL(w.url);
          if (u.origin === self.location.origin) {
            w.focus();
            if ("navigate" in w) return w.navigate(url);
            return;
          }
        } catch (_) {}
      }
      return self.clients.openWindow(url);
    }),
  );
});
