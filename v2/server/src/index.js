// Entrada del Worker de Cloudflare: conecta la API con los servicios reales.
// Secretos (wrangler secret put …): MASTER_SECRET, APPLE_PRIVATE_KEY, GOOGLE_PRIVATE_KEY, UPSTASH_REDIS_REST_TOKEN.
import postgres from 'postgres';
import { Redis } from '@upstash/redis/cloudflare';
import { createApp } from './app.js';
import { SessionRepository } from './models/SessionRepository.js';
import { PurchaseRepository } from './models/PurchaseRepository.js';
import { AccountRepository } from './models/AccountRepository.js';
import { PurchaseService } from './services/PurchaseService.js';
import { AppleStoreVerifier } from './services/AppleStoreVerifier.js';
import { GooglePlayVerifier } from './services/GooglePlayVerifier.js';
import { FirebaseTokenVerifier } from './services/FirebaseTokenVerifier.js';
import { RedisNonceStore } from './services/NonceStore.js';

export default {
  async fetch(request, env, ctx) {
    // Hyperdrive mantiene las conexiones a PostgreSQL abiertas cerca del Worker.
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
    const allowSandbox = env.ALLOW_SANDBOX === 'true';
    const purchases = new PurchaseRepository(sql);
    const app = createApp({
      masterSecret: env.MASTER_SECRET,
      sessions: new SessionRepository(sql),
      nonces: new RedisNonceStore(new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })),
      accounts: new AccountRepository(sql),
      firebaseTokens: new FirebaseTokenVerifier({ projectId: env.FIREBASE_PROJECT_ID }),
      purchaseService: new PurchaseService({
        purchases,
        verifiers: {
          apple: new AppleStoreVerifier({ issuerId: env.APPLE_ISSUER_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY, bundleId: env.APP_ID, allowSandbox }),
          google: new GooglePlayVerifier({ packageName: env.APP_ID, clientEmail: env.GOOGLE_CLIENT_EMAIL, privateKey: env.GOOGLE_PRIVATE_KEY, allowSandbox }),
        },
      }),
    });
    try { return await app.fetch(request, env, ctx); } finally { ctx.waitUntil(sql.end()); }
  },
};
