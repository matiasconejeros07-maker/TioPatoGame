#!/usr/bin/env node
// Uso (ver docs/02-migracion-firebase.md):
//   node migrar.js revisar    base.json usuarios.json            → solo informa, no escribe nada
//   node migrar.js cargar     base.json usuarios.json            → carga en PostgreSQL (DATABASE_URL)
//   node migrar.js marcadores | redis-cli -u "$REDIS_URL"        → reconstruye los marcadores en Redis
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { transform } from './transformar.js';
import { load, MigrationError } from './cargar.js';
import { leaderboardCommands } from './marcadores.js';

const [action, rtdbFile, authFile] = process.argv.slice(2);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const connect = () => {
  if (!process.env.DATABASE_URL) throw new MigrationError('Falta la variable DATABASE_URL.');
  return postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
};

async function main() {
  if (action === 'marcadores') {
    const sql = connect();
    try { for (const c of await leaderboardCommands(sql)) console.log(c.join(' ')); } finally { await sql.end(); }
    return;
  }
  if (!['revisar', 'cargar'].includes(action) || !rtdbFile || !authFile)
    throw new MigrationError('Uso: node migrar.js <revisar|cargar> base.json usuarios.json   ·   node migrar.js marcadores');

  const data = transform(readJson(rtdbFile), readJson(authFile).users ?? []);
  console.error('Sumas de control de Firebase:', data.totals);
  if (data.anomalies.length) console.error('Datos anómalos:\n  ' + data.anomalies.join('\n  '));
  if (action === 'revisar') return;

  const sql = connect();
  try {
    const result = await load(sql, data);
    console.error(`Listo: ${result.imported} cuentas cargadas, ${result.skipped} omitidas (ya enlazadas en la V2).`);
    console.error('Sumas de control de PostgreSQL:', result.totals);
  } finally { await sql.end(); }
}

main().catch((e) => { console.error(e instanceof MigrationError ? e.message : e); process.exit(1); });
