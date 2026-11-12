// Raíz de composición: el único lugar donde se decide qué implementación concreta usa cada pieza.
// Los Controladores reciben sus dependencias desde aquí (no las crean ellos).
import { GameFlowModel } from './models/GameFlowModel.js';
import { AdPolicyModel } from './models/AdPolicyModel.js';
import { PowerUpInventoryModel } from './models/PowerUpModel.js';
import { EntitlementsModel } from './models/EntitlementsModel.js';
import { ProfileModel } from './models/ProfileModel.js';
import { SessionModel } from './models/SessionModel.js';
import { ConsentController } from './controllers/ConsentController.js';
import { AdsController } from './controllers/AdsController.js';
import { PurchaseController } from './controllers/PurchaseController.js';
import { ProfileController } from './controllers/ProfileController.js';
import { PowerUpController } from './controllers/PowerUpController.js';
import { AuthController } from './controllers/AuthController.js';
import { GameFlowController } from './controllers/GameFlowController.js';
import { STORE_LINKS } from '../../shared/ids.js';

/**
 * El juego completo (app de iOS / Android).
 * @param {{ platform: 'ios'|'android', api: import('./services/ports.js').Api & { open: Function },
 *           consent: import('./services/ports.js').ConsentService, ads: import('./services/ports.js').AdsService,
 *           store: import('./services/ports.js').StoreService, identity: import('./services/ports.js').IdentityService,
 *           attestation: import('./services/ports.js').AttestationService, sessionStore: import('./services/ports.js').SessionStore,
 *           legacyAuth: import('./services/ports.js').LegacyAuthService }} services
 */
export function createGame(services) {
  const models = {
    flow: new GameFlowModel(), adPolicy: new AdPolicyModel(), powerUps: new PowerUpInventoryModel(),
    entitlements: new EntitlementsModel(), profile: new ProfileModel(), session: new SessionModel(),
  };
  const { api } = services;
  const auth = new AuthController({ ...services, session: models.session, profile: models.profile });
  const consent = new ConsentController({ consent: services.consent });
  const ads = new AdsController({ ads: services.ads, policy: models.adPolicy, consent, entitlements: models.entitlements });
  const purchases = new PurchaseController({ store: services.store, api, inventory: models.powerUps, entitlements: models.entitlements, getUserId: () => models.session.current?.userId ?? null });
  const profile = new ProfileController({ api, profile: models.profile });
  const powerUps = new PowerUpController({ api, inventory: models.powerUps });
  const flow = new GameFlowController({ flow: models.flow, ads, purchases, powerUps });
  return { models, controllers: { flow, auth, consent, ads, purchases, profile, powerUps } };
}

/**
 * Versión web = «Modo Práctica»: solo la partida. Sin cuenta, sin progreso, sin tienda, sin marcadores y sin anuncios.
 * No recibe ningún servicio: no hay forma de que hable con la API (que además exige una app atestada).
 * La Vista muestra un aviso con `storeLinks` invitando a descargar la app para competir.
 */
export function createPracticeGame() {
  const nothing = async () => {};
  const models = { flow: new GameFlowModel(), session: new SessionModel() };
  models.session.practice = true;
  const flow = new GameFlowController({
    flow: models.flow,
    ads: { start: nothing, preload() {}, breakAfterMatch: async () => false },
    purchases: { sync: nothing, recoverPending: nothing },
    powerUps: { beginMatch: nothing },
  });
  return { models, controllers: { flow }, storeLinks: STORE_LINKS };
}
