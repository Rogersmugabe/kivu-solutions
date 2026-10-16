const CACHE='kivu-v4-8-8-shell';
const SHELL=[
  './','./index.html','./css/style.css','./js/config.js','./js/offline-queue.js',
  './js/camera-scanner.js','./js/app.js','./manifest.webmanifest',
  './icons/kivu-192.png','./icons/kivu-512.png','./js/pwa-install.js'
];

// Camera decoder dependencies used by Kivu V4.8.4.
// They are warmed into Cache Storage during the first online install so later
// barcode scans keep working when the device loses internet connectivity.
const SCANNER_ASSETS=[
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/@zxing/browser@0.1.1/umd/zxing-browser.min.js'
];

async function cacheScannerAssets(cache){
  await Promise.all(SCANNER_ASSETS.map(async url=>{
    try{
      const req=new Request(url,{mode:'no-cors',cache:'reload'});
      const res=await fetch(req);
      // Cross-origin CDN responses can be opaque (status 0). Cache.put accepts
      // opaque responses, which is exactly what we need for offline script reuse.
      await cache.put(req,res.clone());
    }catch(err){
      console.warn('Kivu: scanner asset could not be pre-cached',url,err);
    }
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(SHELL);
    await cacheScannerAssets(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    const cache=await caches.open(CACHE);
    await cacheScannerAssets(cache);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  // Never cache Supabase API responses containing live business data.
  if(url.hostname.endsWith('supabase.co'))return;

  // Only explicitly permitted scanner CDN assets or our own site are cached.
  if(url.origin!==self.location.origin && !SCANNER_ASSETS.includes(url.href))return;

  // Scanner libraries are cache-first. If not cached yet and online, fetch and
  // store them (including opaque cross-origin responses). If offline, use the
  // already warmed copy.
  if(SCANNER_ASSETS.includes(url.href)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const hit=await cache.match(req) || await cache.match(url.href);
      if(hit)return hit;
      try{
        const res=await fetch(req);
        await cache.put(req,res.clone());
        return res;
      }catch(err){
        throw err;
      }
    })());
    return;
  }

  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put('./index.html',copy));
      return r;
    }).catch(()=>caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(req).then(hit=>{
    const network=fetch(req).then(r=>{
      if(r && r.ok){
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(req,copy));
      }
      return r;
    }).catch(()=>hit);
    return hit||network;
  }));
});
