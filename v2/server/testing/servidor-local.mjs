// API V2 completa en este computador, contra un PostgreSQL de prueba (TEST_DATABASE_URL), para probar el juego de
// punta a punta en el navegador. Crea un jugador con su sesión y escribe en la salida estándar, en una línea, la
// configuración que la app le pasa al juego (window.V2_NUBE). Las tiendas, el SSO y la atestación son dobles.
//   TEST_DATABASE_URL=postgres://… node testing/servidor-local.mjs [puerto] [nombre]
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { SessionRepository } from '../src/repositories/SessionRepository.js';
import { PurchaseRepository } from '../src/repositories/PurchaseRepository.js';
import { AccountRepository } from '../src/repositories/AccountRepository.js';
import { MatchRepository } from '../src/repositories/MatchRepository.js';
import { GameRepository } from '../src/repositories/GameRepository.js';
import { PurchaseService } from '../src/services/PurchaseService.js';
import { MemoryRedis, NonceStore, RateLimiter } from '../src/services/stores.js';
import { deriveSessionKey } from '../../shared/signature.js';
import { createTestDatabase } from '../../test-support/db.js';

const PORT = Number(process.argv[2] || 8790), NOMBRE = process.argv[3] || 'Ana';
const MASTER = 'secreto-maestro-local';
const db = await createTestDatabase(), { sql } = db;
const redis = new MemoryRedis(Date.now);
const app = createApp({
  masterSecret: MASTER, now: Date.now, webOrigins: [`http://localhost:${PORT + 1}`, 'http://localhost:8805', 'http://127.0.0.1:8805'],
  sessions: new SessionRepository(sql), nonces: new NonceStore(redis), rateLimiter: new RateLimiter(redis),
  accounts: new AccountRepository(sql), matches: new MatchRepository(sql), game: new GameRepository(sql),
  purchaseService: new PurchaseService({ purchases: new PurchaseRepository(sql), verifiers: {} }),
});

const [user] = await sql`INSERT INTO users (display_name, name_key) VALUES (${NOMBRE}, ${NOMBRE.toLowerCase()}) RETURNING id`;
await sql`INSERT INTO wallets (user_id) VALUES (${user.id})`;
const [session] = await sql`INSERT INTO sessions (user_id, expires_at) VALUES (${user.id}, now() + interval '1 day') RETURNING id`;
const clave = Buffer.from(await deriveSessionKey(MASTER, session.id)).toString('base64');

const server = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await app.fetch(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});
server.listen(PORT, () => {
  console.log(JSON.stringify({ base: `http://localhost:${PORT}`, db: db.url, userId: user.id, sesion: { id: session.id, clave, uid: user.id, nombre: NOMBRE, key: NOMBRE.toLowerCase() } }));
});
const fin = async () => { server.close(); await db.drop(); process.exit(0); };
process.on('SIGTERM', fin); process.on('SIGINT', fin);
