/* ============================================================
   شحنك DZ — sw.js (Service Worker)
   استراتيجية: Network-first للصفحات + Cache-first للأصول الثابتة
   ============================================================ */

const CACHE = "shdz-v5";
const CORE = [
  "index.html",
  "buy.html",
  "track.html",
  "custom.html",
  "css/styles.css",
  "js/config.js",
  "js/data.js",
  "js/app.js",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
  "assets/img/favicon-32.png",
  "assets/img/apple-touch-icon.png",
  "manifest.webmanifest",
];

/* التثبيت: تخزين الأساسيات */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

/* التنشيط: تنظيف الإصدارات القديمة */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* الجلب */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  /* تجاهل غير GET */
  if (e.request.method !== "GET") return;

  /* تجاهل النطاقات الخارجية (خطوط جوجل وغيرها) */
  if (url.origin !== location.origin) return;

  /* الصفحات: شبكة أولاً ثم كاش (للتحديثات) */
  if (e.request.mode === "navigate" || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match("index.html")))
    );
    return;
  }

  /* الأصول: كاش أولاً */
  e.respondWith(
    caches.match(e.request).then((m) => m || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => m))
  );
});
