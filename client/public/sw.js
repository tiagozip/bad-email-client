self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let title = "New mail";
      let body = "";
      let count = 0;
      try {
        const res = await fetch("/api/push/latest", { credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          title = data.title || title;
          body = data.body || "";
          count = data.count || 0;
        }
      } catch {}
      if (event.data) {
        try {
          const payload = event.data.json();
          title = payload.title || title;
          body = payload.body || body;
        } catch {}
      }
      await self.registration.showNotification(title, {
        body,
        tag: "estrogen-mail",
        renotify: true,
        data: { url: "/", count },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
