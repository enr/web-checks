self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('v1').then((c) => c.addAll(['/'])));
});
