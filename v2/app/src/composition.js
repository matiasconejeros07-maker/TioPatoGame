// Raíz de composición: el único lugar donde se decide qué implementación concreta usa cada pieza.
// Los Controladores reciben sus dependencias desde aquí (no las crean ellos).
import { GameFlowModel } from './models/GameFlowModel.js';
import { AdPolicyModel } from './models/AdPolicyModel.js';
import { PowerUpInventoryModel } from './models/PowerUpModel.js';
import { ConsentController } from './controllers/ConsentController.js';
import { AdsController } from './controllers/AdsController.js';
import { PurchaseController } from './controllers/PurchaseController.js';
import { GameFlowController } from './controllers/GameFlowController.js';

/**
 * @param {{ consent: import('./services/ports.js').ConsentService, ads: import('./services/ports.js').AdsService,
 *           store: import('./services/ports.js').StoreService, api: import('./services/ports.js').Api, getUserId: () => string }} services
 */
export function createGame(services) {
  const models = { flow: new GameFlowModel(), adPolicy: new AdPolicyModel(), powerUps: new PowerUpInventoryModel() };
  const consent = new ConsentController({ consent: services.consent });
  const ads = new AdsController({ ads: services.ads, policy: models.adPolicy });
  const purchases = new PurchaseController({ store: services.store, api: services.api, inventory: models.powerUps, getUserId: services.getUserId });
  const flow = new GameFlowController({ flow: models.flow, consent, ads, purchases });
  return { models, controllers: { flow, consent, ads, purchases } };
}
