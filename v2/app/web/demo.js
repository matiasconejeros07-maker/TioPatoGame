// DEMO jugable en el navegador: el juego completo con servicios simulados (servidor, tiendas, anuncios e inicio
// de sesión de mentira, todo guardado en este dispositivo). Con ?practica abre el Modo Práctica, que es lo que
// verá quien entre por la web cuando el juego esté publicado.
import { createGame, createPracticeGame } from '../src/composition.js';
import { AppView } from '../src/views/AppView.js';
import { AudioService } from '../src/services/AudioService.js';
import { DemoApi } from '../src/services/adapters/demo/DemoApi.js';
import { createDemoPlatform } from '../src/services/adapters/demo/DemoPlatform.js';
import { DemoController } from '../src/controllers/DemoController.js';

async function start() {
  const root = document.getElementById('app'), audio = new AudioService();
  if (location.hash === '#practica') { const game = createPracticeGame({ audio }); new AppView(root, game); await game.controllers.flow.boot(); return game; }

  const api = new DemoApi();
  const game = createGame({ ...createDemoPlatform(), api, audio });
  game.controllers.demo = new DemoController({ api, wallet: game.models.wallet, audio: game.controllers.audio });
  await game.controllers.session.enter();
  new AppView(root, game);
  await game.controllers.flow.boot();
  return game;
}
globalThis.__game = start();
