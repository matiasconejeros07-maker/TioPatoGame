// Base de datos temporal para las pruebas: crea una base nueva, aplica las migraciones y la borra al final.
// Necesita TEST_DATABASE_URL (un PostgreSQL donde se puedan crear bases), p. ej. postgres://postgres:postgres@localhost/postgres
import { readdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const MIGRATIONS = new URL('../db/migrations/', import.meta.url);
export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

export async function createTestDatabase() {
  const name = 'tiopato_test_' + randomBytes(6).toString('hex');
  const admin = postgres(process.env.TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = '/' + name;
  const sql = postgres(url.href, { max: 4, onnotice: () => {} });
  for (const file of readdirSync(MIGRATIONS).sort()) await sql.unsafe(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  return {
    sql,
    async drop() { await sql.end(); await admin.unsafe(`DROP DATABASE ${name}`); await admin.end(); },
  };
}
