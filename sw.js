/* WorkerPool service worker: shows flight deal alerts (and any future notifications).
   It doesn't cache pages or intercept requests. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "WorkerPool", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "WorkerPool", {
    body: d.body || "", data: { url: d.url || "/tools/flights/" }, tag: d.url || "wp", renotify: true,
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ("focus" in list[i]) { list[i].navigate(url); return list[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
