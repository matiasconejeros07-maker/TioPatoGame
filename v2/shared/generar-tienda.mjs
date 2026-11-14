#!/usr/bin/env node
// Copia el catálogo del juego (v2/juego/tienda.js, que es un script de navegador: window.TIENDA = …) a un módulo
// que pueden importar el servidor y las pruebas: shared/tienda-datos.js. Así hay UNA sola fuente de precios y premios.
//   node shared/generar-tienda.mjs          → escribe el archivo
//   node shared/generar-tienda.mjs --check  → falla si el archivo no está al día (lo usa la CI)
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const origen = new URL('../juego/tienda.js', import.meta.url), destino = new URL('./tienda-datos.js', import.meta.url);
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(origen, 'utf8'), ctx);
const texto = '// Generado por shared/generar-tienda.mjs desde juego/tienda.js: no editar a mano.\n'
  + 'export const TIENDA = Object.freeze(' + JSON.stringify(ctx.window.TIENDA) + ');\n';
if (process.argv.includes('--check')) {
  let actual = ''; try { actual = readFileSync(destino, 'utf8'); } catch (e) {}
  if (actual !== texto) { console.error('shared/tienda-datos.js no está al día: corre node shared/generar-tienda.mjs'); process.exit(1); }
} else writeFileSync(destino, texto);
