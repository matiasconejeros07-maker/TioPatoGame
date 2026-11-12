// Comprueba la carpeta que se publica (dist/): que esté completa, que no lleve nada del repositorio ni menciones a GitHub y que la redirección opcional funcione.
// Uso:  node pruebas/dist.test.js   (arma dist/ con herramientas/publicar.js)
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const raiz = path.join(__dirname, '..'), dist = path.join(raiz, 'dist');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, x); } };

execFileSync('node', [path.join(raiz, 'herramientas', 'publicar.js')], { stdio: 'pipe' });
const lista = []; (function rec(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? rec(p) : lista.push(path.relative(dist, p)); } })(dist);

console.log('Contenido de dist/');
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/const ASSETS = (\[.*?\]);/s)[1]).filter(a => a !== './');
ok('está todo lo que el service worker precarga (' + assets.length + ' archivos)', assets.every(a => lista.includes(a)), assets.filter(a => !lista.includes(a)).join(','));
const codigo = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8') + fs.readFileSync(path.join(raiz, 'tienda.js'), 'utf8');
const refs = [...new Set(codigo.match(/(?:skins|trajes|fondos|icons|pato)\/[A-Za-z0-9_-]+\.(?:webp|png|jpg)/g) || [])].filter(r => !/-N\./.test(r));      // «aurora-N.webp» es solo un comentario con el patrón del nombre
ok('están todas las imágenes que nombra el código (' + refs.length + ')', refs.every(r => lista.includes(r)), refs.filter(r => !lista.includes(r)).join(','));
ok('lleva el archivo _headers con la política de seguridad', lista.includes('_headers') && /Content-Security-Policy:.*frame-ancestors 'none'/.test(fs.readFileSync(path.join(dist, '_headers'), 'utf8')));
const prohibidos = ['.github', '.git', '.firebaserc', 'firebase.json', 'firebase-rules.json', 'LEEME.md', 'README.md', 'pruebas', 'herramientas', 'oro', 'node_modules', '.nojekyll'];
ok('no lleva nada del repositorio (pruebas, herramientas, reglas, documentación, archivos ocultos)', !prohibidos.some(x => lista.some(f => f === x || f.startsWith(x + path.sep))), prohibidos.filter(x => lista.some(f => f === x || f.startsWith(x + path.sep))).join(','));
const textos = lista.filter(f => /\.(html|js|json|webmanifest|css|txt)$/.test(f) || f === '_headers');
const conGithub = textos.filter(f => /github|matiasconejeros|gmail/i.test(fs.readFileSync(path.join(dist, f), 'utf8')));
ok('ningún archivo publicado nombra GitHub, tu usuario ni tu correo', conGithub.length === 0, conGithub.join(','));
ok('pesa poco (menos de 6 MB en total y ningún archivo de más de 1 MB salvo la página)', lista.reduce((a, f) => a + fs.statSync(path.join(dist, f)).size, 0) < 6e6 && lista.every(f => f === 'index.html' || fs.statSync(path.join(dist, f)).size < 1e6));

console.log('Redirección opcional a un link nuevo (config.js)');
const cfg = fs.readFileSync(path.join(dist, 'config.js'), 'utf8');
const correr = (nuevo, origen) => { let destino = null; const ctx = { window: {}, URL, location: { origin: origen, search: '?a=1', replace: u => { destino = u; } } }; vm.createContext(ctx); vm.runInContext(cfg.replace("window.ENLACE_NUEVO = '';", `window.ENLACE_NUEVO = ${JSON.stringify(nuevo)};`), ctx); return destino; };
ok('vacía (como viene), no hace nada', correr('', 'https://x.example') === null);
ok('si estás en el link nuevo, no se redirige', correr('https://nuevo.example/', 'https://nuevo.example') === null);
ok('si estás en otra dirección, te lleva al link nuevo', correr('https://nuevo.example/', 'https://viejo.example') === 'https://nuevo.example/?a=1', String(correr('https://nuevo.example/', 'https://viejo.example')));
ok('un link nuevo mal escrito no rompe el juego', correr('esto no es un link', 'https://viejo.example') === null);
const original = fs.readFileSync(path.join(raiz, 'config.js'), 'utf8');
ok('el config.js del repositorio sigue con la redirección apagada', /window\.ENLACE_NUEVO = '';/.test(original));

console.log(`\n${pass} correctas, ${fail} fallas`);
process.exit(fail ? 1 : 0);
