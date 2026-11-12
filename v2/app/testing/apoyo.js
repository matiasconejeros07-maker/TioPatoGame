// Servicios de plataforma falsos (sin teléfono, sin AdMob, sin tienda, sin servidor) para probar los controladores.
import { ApiError } from '../src/services/ApiClient.js';
import { PRODUCT_IDS } from '../../shared/ids.js';

export const PACK = PRODUCT_IDS.pack1, NO_ADS = PRODUCT_IDS.noAds;

export function fakes({ consentAnswered = true, owned = { powerups: {}, entitlements: [] } } = {}) {
  const log = [];
  const state = {
    consentAnswered, adLoads: true, apiError: null, pending: [], restorable: [], storeResult: undefined, owned,
    saved: null, login: { status: 200 }, serverRejectsPowerUps: false, offline: false,
  };
  const services = {
    platform: 'android',
    // canRequestAds es true cuando el jugador ya respondió el formulario, haya aceptado o rechazado
    consent: { async gather() { log.push('consent'); return { canRequestAds: state.consentAnswered, privacyOptionsRequired: true }; }, async showPrivacyOptions() {} },
    ads: {
      async initialize() { log.push('ads:init'); },
      async loadInterstitial() { log.push('ads:load'); return state.adLoads; },
      async showInterstitial() { log.push('ads:show'); },
    },
    store: {
      async getProducts(ids) { return [...ids.filter((id) => id === PACK || id === NO_ADS), 'desconocido'].map((productId) => ({ productId, priceLabel: '$990' })); },
      async purchase(productId, userId) { log.push(`store:buy:${userId}`); return state.storeResult === undefined ? { store: 'google', productId, purchaseToken: 'tok' } : state.storeResult; },
      async pendingPurchases() { return state.pending; },
      async restorablePurchases() { return state.restorable; },
      async finish(p) { log.push('store:finish:' + (p.purchaseToken ?? p.transactionId)); },
    },
    identity: { async signIn(challenge) { log.push('sso'); if (state.cancelSso) throw { cancelled: true }; return { serverAuthCode: 'codigo-para-' + challenge }; } },
    attestation: { canRenew: false, async attest(challenge, { renew } = {}) { log.push(renew ? 'attest:renew' : 'attest'); return { integrityToken: 'token-para-' + challenge, deviceId: 'abc' }; } },
    sessionStore: { async load() { return state.saved; }, async save(s) { state.saved = s; }, async clear() { state.saved = null; } },
    legacyAuth: { async signIn(login, password) { if (password !== 'correcta') throw new Error('mala'); return 'fb-token-de-' + login; } },
    api: {
      async open(path, data) {
        log.push('api:open' + path);
        if (state.offline) throw new TypeError('sin red');
        if (path === '/auth/challenge') return { challenge: 'reto-' + log.filter((l) => l === 'api:open/auth/challenge').length };
        state.lastLogin = data;
        const next = Array.isArray(state.login) ? state.login.shift() : state.login;
        if (next.status !== 200) throw new ApiError(next.status, next.error, next);
        return { sessionId: 'sesion-1', sessionKey: 'AQID', userId: 'usuario-1', displayName: 'Pato000000001', isNew: true, hasLegacyAccount: false, nextNameChangeAt: null, ...next };
      },
      async request(method, path, data) {
        log.push(`api:${method}${path}`);
        if (state.offline) throw new TypeError('sin red');
        if (state.apiError) throw state.apiError;
        if (path === '/account/name') return { displayName: data.name, nextChangeAt: '2099-01-01T00:00:00.000Z' };
        if (path === '/account/link-legacy') return { userId: 'usuario-antiguo' };
        if (path === '/account/vip') return null;
        if (path === '/matches') return { matchId: 'partida-1', mode: data.mode };
        if (path.endsWith('/powerups') && path.startsWith('/matches/')) {
          if (state.serverRejectsPowerUps) throw new ApiError(409, 'sin_powerups');
          state.owned.powerups[data.powerupId] -= 1;
          return { powerupId: data.powerupId, remaining: state.owned.powerups[data.powerupId] };
        }
        if (path === '/purchases/powerups') { state.owned.powerups[data.powerupId] = (state.owned.powerups[data.powerupId] ?? 0) + 1; return { balance: 250_000, ...state.owned }; }
        if (method === 'POST' && data.productId === NO_ADS) state.owned = { ...state.owned, entitlements: ['no_ads'] };
        if (method === 'POST' && data.productId === PACK) state.owned = { ...state.owned, powerups: { slow: 3 } };
        return method === 'POST' ? { granted: true, ...state.owned } : state.owned;
      },
    },
  };
  return { services, log, state };
}

export const settle = () => new Promise((r) => setTimeout(r, 0));
export const count = (log, entry) => log.filter((l) => l === entry).length;

/** Juega una partida completa y vuelve al menú. @returns si salió un anuncio */
export async function playMatch(game, log) {
  const before = count(log, 'ads:show');
  game.controllers.flow.startMatch();
  game.controllers.flow.endMatch();
  await game.controllers.flow.leaveGameOver();
  await settle();
  return count(log, 'ads:show') > before;
}
