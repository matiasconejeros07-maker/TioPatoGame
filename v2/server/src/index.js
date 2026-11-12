// Entrada del Worker de Cloudflare: conecta la API con los servicios reales.
// Variables: wrangler.toml · Secretos: `wrangler secret put …` (lista en .dev.vars.example).
import postgres from 'postgres';
import { Redis } from '@upstash/redis/cloudflare';
import { createApp } from './app.js';
import { APP_ID } from '../../shared/ids.js';
import { SessionRepository } from './repositories/SessionRepository.js';
import { PurchaseRepository } from './repositories/PurchaseRepository.js';
import { AccountRepository } from './repositories/AccountRepository.js';
import { AuthRepository } from './repositories/AuthRepository.js';
import { MatchRepository } from './repositories/MatchRepository.js';
import { PurchaseService } from './services/PurchaseService.js';
import { AuthService } from './services/AuthService.js';
import { AppleStoreVerifier } from './services/AppleStoreVerifier.js';
import { GooglePlayVerifier } from './services/GooglePlayVerifier.js';
import { GoogleServiceAccount } from './services/GoogleServiceAccount.js';
import { FirebaseTokenVerifier } from './services/FirebaseTokenVerifier.js';
import { AppleIdentityProvider, PlayGamesIdentityProvider } from './services/identityProviders.js';
import { AppAttestAttestor, PlayIntegrityAttestor } from './services/attestors.js';
import { RemoteJwks } from './services/RemoteJwks.js';
import { SecretBox } from './services/crypto.js';
import { ChallengeStore, NonceStore, RateLimiter } from './services/stores.js';

export default {
  async fetch(request, env, ctx) {
    // Hyperdrive mantiene las conexiones a PostgreSQL abiertas cerca del Worker.
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
    const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
    const allowSandbox = env.ALLOW_SANDBOX === 'true';
    const google = new GoogleServiceAccount({ clientEmail: env.GOOGLE_CLIENT_EMAIL, privateKey: env.GOOGLE_PRIVATE_KEY });
    const secretBox = new SecretBox(env.MASTER_SECRET);
    const identityProviders = {
      apple: new AppleIdentityProvider({ clientId: APP_ID, teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_SIGNIN_KEY_ID, privateKey: env.APPLE_SIGNIN_PRIVATE_KEY }),
      google_play_games: new PlayGamesIdentityProvider({ clientId: env.PLAY_GAMES_CLIENT_ID, clientSecret: env.PLAY_GAMES_CLIENT_SECRET }),
    };
    const app = createApp({
      masterSecret: env.MASTER_SECRET,
      sessions: new SessionRepository(sql),
      nonces: new NonceStore(redis),
      rateLimiter: new RateLimiter(redis),
      accounts: new AccountRepository(sql),
      matches: new MatchRepository(sql),
      firebaseTokens: new FirebaseTokenVerifier({ projectId: env.FIREBASE_PROJECT_ID }),
      identityProviders, secretBox,
      authService: new AuthService({
        challenges: new ChallengeStore(redis), auth: new AuthRepository(sql), identityProviders, secretBox, masterSecret: env.MASTER_SECRET,
        attestors: {
          ios: new AppAttestAttestor({ appId: `${env.APPLE_TEAM_ID}.${APP_ID}`, rootCertificatePem: env.APPLE_APP_ATTEST_ROOT_CA, production: env.APP_ATTEST_ENVIRONMENT !== 'development' }),
          android: new PlayIntegrityAttestor({ packageName: APP_ID, account: google }),
        },
      }),
      purchaseService: new PurchaseService({
        purchases: new PurchaseRepository(sql),
        verifiers: {
          apple: new AppleStoreVerifier({ issuerId: env.APPLE_ISSUER_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY, bundleId: APP_ID, allowSandbox }),
          google: new GooglePlayVerifier({ packageName: APP_ID, account: google, allowSandbox }),
        },
      }),
      googlePush: new RemoteJwks({ url: 'https://www.googleapis.com/oauth2/v3/certs' }),
      googlePushAudience: env.GOOGLE_PUSH_AUDIENCE, googlePushEmail: env.GOOGLE_PUSH_SERVICE_ACCOUNT, packageName: APP_ID,
    });
    try { return await app.fetch(request, env, ctx); } finally { ctx.waitUntil(sql.end()); }
  },
};
