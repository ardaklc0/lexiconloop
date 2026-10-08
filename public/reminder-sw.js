self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data?.json() ?? {};
    } catch {
        payload = { body: event.data?.text() ?? "A few words are ready for review." };
    }

    event.waitUntil(self.registration.showNotification(payload.title ?? "A quick review is waiting", {
        body: payload.body ?? "Take a minute for a few words today.",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "daily-review",
        data: { url: payload.url ?? "/" },
    }));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
    event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
        for (const client of clients) {
            if ("focus" in client) {
                await client.focus();
                if ("navigate" in client) await client.navigate(targetUrl);
                return;
            }
        }
        await self.clients.openWindow(targetUrl);
    }));
});