// 鯊魚日常 — 推播通知用的 service worker。
// 這個檔案很單純：收到推播就跳通知，點通知就把 App 帶到前景。

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {}
  var title = data.title || "鯊魚日常";
  var body = data.body || "有新的好友對戰更新";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      tag: "shark-daily-battle",
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
