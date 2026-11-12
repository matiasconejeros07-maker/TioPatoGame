#!/usr/bin/env node
// Arma la carpeta dist/ con SOLO lo que el juego necesita para funcionar (nada de pruebas, herramientas, documentación, reglas ni archivos ocultos).
// Es lo que se publica en Cloudflare Pages (o Netlify / Firebase Hosting): así en el sitio no queda nada de tu repositorio.
// Uso (desde la carpeta del juego):  node herramientas/publicar.js
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..'), dist = path.join(raiz, 'dist');
const ARCHIVOS = ['index.html', 'config.js', 'tienda.js', 'dialogos.js', 'manifest.webmanifest', 'sw.js'];
const CARPETAS = ['icons', 'skins', 'trajes', 'fondos', 'pato'];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const a of ARCHIVOS) fs.copyFileSync(path.join(raiz, a), path.join(dist, a));
for (const c of CARPETAS) fs.cpSync(path.join(raiz, c), path.join(dist, c), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'cloudflare-headers.txt'), path.join(dist, '_headers'));

// comprobación: todo lo que el service worker precarga tiene que estar en dist/ (si falta algo, la instalación de la app fallaría)
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/const ASSETS = (\[.*?\]);/s)[1]).filter(a => a !== './');
const faltan = assets.filter(a => !fs.existsSync(path.join(dist, a)));
if (faltan.length) { console.error('Faltan en dist/:', faltan.join(', ')); process.exit(1); }

let n = 0, bytes = 0;
(function recorrer(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) recorrer(p); else { n++; bytes += fs.statSync(p).size; } } })(dist);
console.log(`dist/ listo: ${n} archivos, ${(bytes / 1e6).toFixed(2)} MB · el service worker precarga ${assets.length} y están todos`);
