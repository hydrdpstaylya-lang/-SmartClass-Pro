// Network-first shell. Old caches are removed to prevent a stale blank page after deployment.
const CACHE='smartclass-app-vercel-v1';
self.addEventListener('install', event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('smartclass-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{const r=event.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;if(r.mode==='navigate'){event.respondWith(fetch(r).catch(()=>caches.match('/')));}});
