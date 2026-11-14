// Arma la DEMO jugable de la V2 en una sola página (la que se publica para probar desde el teléfono):
//   node build-demo.mjs  →  dist/fragment.html (página para publicar) · dist/index.html (para abrir con un servidor) · imágenes
// La página es el juego tal cual (index.html + tienda.js + dialogos.js + los módulos de la V2) con un Firebase local.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const here = new URL('.', import.meta.url), repo = new URL('../../', here), dist = new URL('dist/', here);
const read = (path) => readFileSync(new URL(path, here), 'utf8');
const scriptTag = (code) => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;

// v2.js: los módulos de la V2 empaquetados en un solo script (también es el archivo que se publica junto a index.html)
const { outputFiles: [v2] } = await build({ entryPoints: [new URL('v2/main.js', here).pathname], bundle: true, format: 'iife', minify: true, target: 'es2020', write: false });
writeFileSync(new URL('v2.js', here), '// Generado por build-demo.mjs desde v2/*.js: no editar a mano.\n' + v2.text);
// fondos-worker.js: el worker que dibuja los fondos premium en otro hilo (se publica junto a index.html; la demo lo lleva adentro)
const { outputFiles: [fw] } = await build({ entryPoints: [new URL('v2/fondos-worker.js', here).pathname], bundle: true, format: 'iife', minify: true, target: 'es2020', write: false });
writeFileSync(new URL('fondos-worker.js', here), '// Generado por build-demo.mjs desde v2/fondos-worker.js: no editar a mano.\n' + fw.text);
let html = read('index.html');
const head = html.slice(0, html.indexOf('<body')), body = html.slice(html.indexOf('<body'));
// del <head> solo sirven el título y los estilos (la CSP, el manifiesto y los íconos son de la versión publicada)
const styles = [...head.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n') + '\n<style>\n' + read('v2.css') + '\n</style>';
let page = body.replace(/^<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
const bodyClass = (body.match(/^<body class="([^"]*)"/) || [])[1] || '';
page = page
  .replace('<script src="config.js"></script>', () => scriptTag(read('demo/firebase-local.js')) + '\n' + scriptTag(read('demo/config.js')))      // (con función: el texto
  .replace('<script src="tienda.js"></script>', () => scriptTag(read('tienda.js')))                                                    //  insertado tiene «$'» y «$&»,
  .replace('<script src="dialogos.js"></script>', () => scriptTag(read('dialogos.js')))                                               //  que replace() con texto interpreta)
  .replace('<script src="v2.js"></script>', () => scriptTag('window.__V2_FONDOS_WORKER = ' + JSON.stringify(fw.text) + ';') + '\n' + scriptTag(v2.text))
  .replace(/if \('serviceWorker' in navigator[^\n]*\n[^\n]*\n/, '');                  // la demo no instala nada
const out = `<title>Gánale al Tío Pato</title>
<meta name="claude:viewport-fit-sides" content="cover">
${styles}
<style>html,body{height:100%}</style>
<script>document.body.className = ${JSON.stringify(bodyClass)};</script>
${page}`;

mkdirSync(dist, { recursive: true });
writeFileSync(new URL('fragment.html', dist), out);
writeFileSync(new URL('index.html', dist), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${out}</body></html>`);
for (const dir of ['skins', 'trajes', 'fondos', 'pato', 'icons', 'oro']) cpSync(new URL(dir + '/', repo), new URL(dir + '/', dist), { recursive: true });
console.log(`dist/fragment.html · ${(out.length / 1024).toFixed(0)} KB`);
