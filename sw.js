// Cache only static Tree Task assets, never authentication or Microsoft Graph traffic.
const CACHE_NAME='tree-task-v3-notes-1';
const ASSETS=['./','./index.html','./sync-merge.js','./onedrive-sync.js','./planning-core.js','./planning.css','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tree-task-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Only cache bundled assets; exclude OAuth callbacks and other query URLs.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search||!ASSETS.some(asset=>new URL(asset,self.location.href).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
