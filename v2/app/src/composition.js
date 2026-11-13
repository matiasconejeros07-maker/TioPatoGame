// Raíz de composición: el único lugar donde se decide qué implementación concreta usa cada pieza.
// Los Controladores reciben sus dependencias desde aquí (no las crean ellos).
import { GameFlowModel } from './models/GameFlowModel.js';
import { AdPolicyModel } from './models/AdPolicyModel.js';
import { PowerUpInventoryModel } from './models/PowerUpModel.js';
import { EntitlementsModel } from './models/EntitlementsModel.js';
import { ProfileModel } from './models/ProfileModel.js';
import { SessionModel } from './models/SessionModel.js';
import { MatchModel } from './models/MatchModel.js';
import { WalletModel } from './models/WalletModel.js';
import { InventoryModel } from './models/InventoryModel.js';
import { LeaderboardModel } from './models/LeaderboardModel.js';
import { RewardsModel } from './models/RewardsModel.js';
import { SettingsModel } from './models/SettingsModel.js';
import { ResultModel } from './models/ResultModel.js';
import { UiModel } from './models/UiModel.js';
import { ConsentController } from './controllers/ConsentController.js';
import { AdsController } from './controllers/AdsController.js';
import { PurchaseController } from './controllers/PurchaseController.js';
import { ProfileController } from './controllers/ProfileController.js';
import { PowerUpController } from './controllers/PowerUpController.js';
import { AuthController } from './controllers/AuthController.js';
import { GameFlowController } from './controllers/GameFlowController.js';
import { MatchController } from './controllers/MatchController.js';
import { AudioController } from './controllers/AudioController.js';
import { ResultsController } from './controllers/ResultsController.js';
import { ShopController } from './controllers/ShopController.js';
import { RewardsController } from './controllers/RewardsController.js';
import { LeaderboardController } from './controllers/LeaderboardController.js';
import { NavigationController } from './controllers/NavigationController.js';
import { SessionController } from './controllers/SessionController.js';
import { DEFAULT_EQUIPPED } from '../../shared/store.js';
import { STORE_LINKS } from '../../shared/ids.js';

/** Sonido mudo: para las pruebas y para cuando el navegador no tiene Web Audio. */
const SILENT_AUDIO = { unlock: () => false, play() {}, bounce() {}, startMusic() {}, stopMusic() {} };

/**
 * El juego completo (app de iOS / Android).
 * @param {{ platform: 'ios'|'android', api: import('./services/ports.js').Api & { open: Function },
 *           consent: import('./services/ports.js').ConsentService, ads: import('./services/ports.js').AdsService,
 *           store: import('./services/ports.js').StoreService, identity: import('./services/ports.js').IdentityService,
 *           attestation: import('./services/ports.js').AttestationService, sessionStore: import('./services/ports.js').SessionStore,
 *           legacyAuth: import('./services/ports.js').LegacyAuthService, audio?: object, preferences?: object, requestFrame?: Function }} services
 */
export function createGame(services) {
  const models = {
    flow: new GameFlowModel(), adPolicy: new AdPolicyModel(), powerUps: new PowerUpInventoryModel(),
    entitlements: new EntitlementsModel(), profile: new ProfileModel(), session: new SessionModel(),
    match: new MatchModel(), wallet: new WalletModel(), inventory: new InventoryModel(), leaderboard: new LeaderboardModel(),
    rewards: new RewardsModel(), settings: new SettingsModel(), result: new ResultModel(), ui: new UiModel(),
  };
  models.inventory.equipped = DEFAULT_EQUIPPED;
  const { api } = services, { ui, wallet, inventory } = models;

  const audio = new AudioController({ audio: services.audio ?? SILENT_AUDIO, settings: models.settings, inventory, preferences: services.preferences });
  const auth = new AuthController({ ...services, session: models.session, profile: models.profile });
  const consent = new ConsentController({ consent: services.consent });
  const ads = new AdsController({ ads: services.ads, policy: models.adPolicy, consent, entitlements: models.entitlements });
  const purchases = new PurchaseController({ store: services.store, api, inventory: models.powerUps, entitlements: models.entitlements, getUserId: () => models.session.current?.userId ?? null });
  const profile = new ProfileController({ api, profile: models.profile });
  const powerUps = new PowerUpController({ api, inventory: models.powerUps });
  const rewards = new RewardsController({ api, rewards: models.rewards, wallet, ui, audio });
  const leaderboards = new LeaderboardController({ api, leaderboard: models.leaderboard });
  const results = new ResultsController({ api, powerUps, wallet, leaderboard: models.leaderboard, result: models.result, rewards });
  const match = new MatchController({ match: models.match, inventory, powerUps, audio, results, requestFrame: services.requestFrame, onEnded: () => flow.endMatch() });
  const flow = new GameFlowController({ flow: models.flow, ads, purchases, powerUps, match });
  const shop = new ShopController({ api, wallet, inventory, ui, purchases, audio });
  const nav = new NavigationController({ ui, audio, leaderboards, rewards });
  const session = new SessionController({ api, auth, models, rewards, ui });
  return { models, controllers: { flow, auth, session, consent, ads, purchases, profile, powerUps, match, audio, shop, rewards, leaderboards, nav }, storeLinks: STORE_LINKS };
}

/**
 * Versión web = «Modo Práctica»: solo la partida. Sin cuenta, sin progreso, sin tienda, sin marcadores y sin anuncios.
 * No recibe ningún servicio de red: no hay forma de que hable con la API (que además exige una app atestada).
 * La Vista muestra un aviso con `storeLinks` invitando a descargar la app para competir.
 * @param {{ audio?: object, requestFrame?: Function }} [services]
 */
export function createPracticeGame(services = {}) {
  const nothing = async () => {};
  const models = { flow: new GameFlowModel(), session: new SessionModel(), match: new MatchModel(), inventory: new InventoryModel(), settings: new SettingsModel(), result: new ResultModel() };
  models.session.practice = true;
  models.inventory.equipped = DEFAULT_EQUIPPED;
  const audio = new AudioController({ audio: services.audio ?? SILENT_AUDIO, settings: models.settings, inventory: models.inventory });
  const noPowerUps = { match: null, beginMatch: nothing, isActive: () => false, remainingMs: () => 0, tick() {}, activate: () => ({ ok: false }) };
  // El resumen de la partida se muestra, pero no se guarda ni se envía a ninguna parte.
  const results = { async finish(match) { models.result.last = { hits: match.hits, mode: match.mode, seconds: Math.round(match.durationMs / 1000), earned: 0, isRecord: false, best: 0, saved: true }; } };
  const match = new MatchController({ match: models.match, inventory: models.inventory, powerUps: noPowerUps, audio, results, requestFrame: services.requestFrame, onEnded: () => flow.endMatch() });
  const flow = new GameFlowController({
    flow: models.flow, match, powerUps: noPowerUps,
    ads: { start: nothing, preload() {}, breakAfterMatch: async () => false },
    purchases: { sync: nothing, recoverPending: nothing },
  });
  return { models, controllers: { flow, match, audio }, storeLinks: STORE_LINKS };
}
