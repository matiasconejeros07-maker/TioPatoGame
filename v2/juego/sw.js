// Service worker de «Gánale al Tío Pato» V2 (copia del de la V1 con los archivos de la V2): deja el juego listo sin conexión.
// Si cambias imágenes o el código, sube el número de VERSION para que los celulares descarguen lo nuevo.
const VERSION = 'v2-1';
const CACHE = 'tio-pato-' + VERSION;
const ASSETS = ["./", "index.html", "config.js", "tienda.js", "dialogos.js", "v2.js", "v2.css", "fondos-worker.js", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon-64.png", "icons/icon-192.png", "icons/icon-512.png", "icons/logo-carga.webp", "icons/maskable-512.png", "pato/face0.png", "pato/face1.png", "pato/face2.png", "pato/face3.png", "pato/halo.png", "pato/hero_angel.png", "pato/hero_devil.png", "pato/hero_mid.png", "pato/horns.png", "pato/tail.png", "pato/trident.png", "pato/wingL_angel.png", "pato/wingL_devil.png", "pato/wingR_angel.png", "pato/wingR_devil.png", "skins/b1000.webp", "skins/b10000.webp", "skins/b2000.webp", "skins/b20000.webp", "skins/b5000.webp", "skins/peso1.webp", "skins/peso10.webp", "skins/peso100.webp", "skins/peso50.webp", "skins/peso500.webp", "trajes/bigotes.webp", "trajes/conejo-enojado.webp", "trajes/conejo.webp", "trajes/conejita.webp", "skins/peso5.webp", "trajes/bigotes-enojado.webp", "trajes/conejita-enojada.webp", "trajes/tios-enojados.webp", "trajes/tios.webp", "fondos/galaxia-1.webp", "fondos/galaxia-2.webp", "fondos/aurora-1.webp", "fondos/aurora-2.webp", "fondos/aurora-3.webp", "trajes/angel.webp", "trajes/angel-demonio.webp", "trajes/galactico.webp", "trajes/galactico-furia.webp", "trajes/teleton.webp", "trajes/dorado.webp", "trajes/dorado-oscuro.webp", "trajes/patita-angel.webp", "trajes/patita-diabla.webp", "skins/plata.webp", "skins/oro.webp", "skins/diamante.webp"];

const good = res => !!res && res.ok && res.status === 200 && (res.type === 'basic' || res.type === 'default');      // nunca se guardan errores (404, 500) ni respuestas parciales
const withTimeout = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v); }, err => { clearTimeout(t); no(err); }); });

self.addEventListener('install', e => {
  // cache: 'reload' → nunca toma una copia vieja del caché del navegador (algunos hostings guardan los archivos varios minutos)
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tio-pato-v2-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                    // la API V2 (y Firebase) y otros: siempre directo a internet

  // Página y configuración: primero internet (para tener siempre lo último; si tarda más de 4 s o no hay conexión, usa la copia guardada). Solo se guardan respuestas buenas.
  const fresh = req.mode === 'navigate' || /\/(config|tienda|v2|fondos-worker)\.js$|\/v2\.css$|\/manifest\.webmanifest$/.test(url.pathname) || url.pathname.endsWith('.html');
  if (fresh) {
    e.respondWith(
      withTimeout(fetch(req), 4000).then(res => { if (good(res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')).then(hit => hit || fetch(req)))
    );
    return;
  }
  // Imágenes e íconos: primero la copia guardada (el personaje secreto, carpeta oro/, no se precarga: se guarda al usarlo) (carga instantánea).
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (good(res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
