const CACHE='rp-ia-v9.8.1-upcoming-admin-fix';
const ASSETS=[
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './eagle-ai-logo.png',
  './rpia-eagle-180.png',
  './rpia-eagle-192.png',
  './rpia-eagle-512.png',
  './config.js',
  './local-adapter.js',
  './server-adapter.js',
  './data-service.js',
  './server-setup.js',
  './engine-core.js',
  './app.js',
  './enterprise-engines.js',
  './platform-v9.js'
];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request).then(response=>response||caches.match('./index.html')))
  );
});
