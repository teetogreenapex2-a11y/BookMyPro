// Runs in the background, separate from any page being open - this is
// what lets a notification show up even if the instructor doesn't have
// the site open at all. Kept deliberately minimal: receive a push,
// show a notification, handle a tap on it.

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "BookMyPro", body: event.data ? event.data.text() : "" };
  }

  var title = data.title || "BookMyPro";
  var options = {
    body: data.body || "",
    icon: "/logo.jpg",
    badge: "/logo.jpg",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification focuses an already-open tab if one exists,
// rather than always opening a new one.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
