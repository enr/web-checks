importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.0/workbox-sw.js');
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || [{ url: '/index.html', revision: 'abc' }]);
workbox.routing.registerRoute(({ request }) => request.destination === 'image', new workbox.strategies.CacheFirst());
