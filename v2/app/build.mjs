// Empaqueta la demo web en una sola página: web/index.html + estilos + todo el JavaScript.
//   node build.mjs  →  dist/index.html (para abrir con cualquier servidor estático) y las imágenes del juego.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url), repo = new URL('../../', here);
const { outputFiles: [bundle] } = await build({ entryPoints: [new URL('web-mvc-borrador/demo.js', here).pathname], bundle: true, format: 'iife', minify: true, target: 'es2022', write: false });
const css = readFileSync(new URL('src/styles.css', here), 'utf8');
const page = readFileSync(new URL('web-mvc-borrador/index.html', here), 'utf8').replace('/*CSS*/', () => css).replace('/*JS*/', () => bundle.text.replace(/<\/script/g, '<\\/script'));

mkdirSync(new URL('dist/', here), { recursive: true });
// `fragment.html` es la página sin envoltorio (la que se publica como artefacto); `index.html` la envuelve para abrirla sola.
writeFileSync(new URL('dist/fragment.html', here), page);
writeFileSync(new URL('dist/index.html', here), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`);
for (const dir of ['skins', 'trajes', 'fondos']) cpSync(new URL(dir + '/', repo), new URL(`dist/${dir}/`, here), { recursive: true });
console.log(`dist/index.html · ${(page.length / 1024).toFixed(0)} KB`);
