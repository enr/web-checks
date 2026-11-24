self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('static').then((c) => c.addAll(['/'])));
});
