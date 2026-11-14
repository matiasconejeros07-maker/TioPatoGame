// V2 · punto de entrada. Arma modelos, controladores y vista, y expone `window.V2`: lo que llama el juego (index.html).
import { CuentaV2, PreferenciasV2, PartidaV2 } from './modelo.js';
import { DatosController, PowerUpController, ComprasController, AnunciosController, NombreController, SonidoController } from './controladores.js';
import { VistaV2 } from './vistas.js';
import { AudioService } from '../../app/src/services/AudioService.js';
import { Ambiente } from './ambiente.js';
import { Fondos } from './fondos.js';
import { registrarBarras } from './barras.js';

const cuenta = new CuentaV2(), prefs = new PreferenciasV2(), partida = new PartidaV2(), vista = new VistaV2();
let api = null, ctl = null;
const $ = (id) => document.getElementById(id);
const tog = (el, on) => { el.classList.toggle('off', !on); el.setAttribute('aria-checked', String(on)); el.querySelector('.tt').textContent = on ? 'SÍ' : 'NO'; };

function pintarAjustes() {
  if (!api) return;
  const s = api.session, con = !!(api.AUTH && s);
  tog($('togMusic'), prefs.musica);
  $('nameRow').hidden = !con; $('adsRow').hidden = !con; $('restoreRow').hidden = !con; $('delAcct').hidden = !con;
  $('demoRow').hidden = !(con && window.__demo);
  if (con) {
    const d = ctl.nombre.diasQueFaltan;
    $('nameSt').textContent = d > 0 ? `Podrás cambiarlo en ${d} ${d === 1 ? 'día' : 'días'}` : 'Puedes cambiarlo una vez cada 30 días';
    $('nameBtn').disabled = d > 0;
    $('adsSt').textContent = cuenta.sinAnuncios ? 'Quitados para siempre ✓' : 'Sale uno cada 5 partidas';
    $('adsBtn').hidden = cuenta.sinAnuncios;
  }
}

window.V2 = {
  attach(puente) {
    api = puente;
    const sonido = new SonidoController({ api, prefs, servicio: new AudioService() });
    ctl = {
      cuenta, prefs, sonido,
      datos: new DatosController({ api, cuenta, prefs }),
      powerUps: new PowerUpController({ api, cuenta, partida, vista, audio: sonido }),
      compras: new ComprasController({ api, cuenta, vista, audio: sonido }),
      anuncios: new AnunciosController({ cuenta, prefs, vista }),
      nombre: new NombreController({ api, cuenta, vista }),
    };
    vista.conectar({ api, ctl });
    cuenta.on('cambio', pintarAjustes); prefs.on('cambio', pintarAjustes);
    cuenta.on('cambio', () => vista.pintarStockArcade(cuenta.powerUps));
    // ajustes
    $('togMusic').addEventListener('click', () => { prefs.musica = !prefs.musica; });
    $('togSound').addEventListener('click', () => setTimeout(() => sonido.sincronizar(), 0));
    $('nameBtn').addEventListener('click', async () => {
      api.closeSettings();
      if (await vista.cambiarNombre(api.session.name, (n) => ctl.nombre.cambiar(n)) === 'ok') vista.aviso('¡Listo! Ahora te llamas ' + api.session.name);
    });
    $('adsBtn').addEventListener('click', async () => { api.closeSettings(); await ctl.compras.comprar(ctl.compras.sinAnuncios); });
    $('restoreBtn').addEventListener('click', () => ctl.compras.restaurar());
    $('demoBtn').addEventListener('click', async () => { window.__demo.addCoins(api.session.uid, 100_000_000); await api.pullWallet(); api.renderCoins(); sonido.efecto('moneda'); vista.aviso('+$100.000.000 de prueba'); });
    $('delAcct').addEventListener('click', async () => {
      api.closeSettings();
      if (!(await vista.confirmarEliminar())) return;
      vista.aviso((await api.deleteAccount()) ? 'Tu cuenta fue eliminada.' : 'No se pudo eliminar. Revisa tu conexión.');
    });
    const abrir = $('openSettings'); abrir && abrir.addEventListener('click', () => { ctl.datos.asegurar().then(pintarAjustes); pintarAjustes(); });
    // al abrir: privacidad (una sola vez) y datos de la cuenta
    // privacidad: la primera vez, en el menú (nunca encima de una partida ni de otra ventana)
    const pedir = () => {
      if (prefs.consentimiento !== null) return;
      const libre = api.state === 'menu' && !document.querySelector('.modal.show') && document.getElementById('menu').classList.contains('show');
      if (libre) ctl.anuncios.pedirConsentimiento(); else setTimeout(pedir, 1500);
    };
    setTimeout(pedir, 2500);
    // lo de la V2 se pide después de que el juego terminó de cargar (así no compite con la racha, la ruleta y la billetera al abrir)
    setTimeout(() => {
      ctl.datos.asegurar();
      setInterval(() => { if (api.session && cuenta.uid !== api.session.uid) ctl.datos.asegurar(); else if (!api.session && cuenta.uid) ctl.datos.asegurar(); }, 2000);
    }, 5000);
    new Ambiente(); window.__v2fondos = new Fondos(); registrarBarras(api.padFx);
  },

  get mode() { return prefs.modo; },
  nameProblem: (n) => ctl?.nombre.problema(n) ?? null,

  setMode(m) { prefs.modo = m === 'arcade' ? 'arcade' : 'classic'; },
  matchStarted(modo) { partida.modo = modo; partida.usados = []; partida.enJuego = true; vista.mostrarHud(modo === 'arcade'); if (modo === 'arcade') ctl.datos.asegurar().then(() => vista.pintarHud()); },
  matchEnded() { partida.enJuego = false; vista.mostrarHud(false); ctl.anuncios.partidaTerminada(); },
  async leaveResult(seguir) { await ctl.anuncios.pausa(); seguir(); },
  bounce: (hits) => (ctl ? ctl.sonido.rebote(hits) : false),
  previewSound: (id) => ctl.sonido.probar(id),
  renderPowerUps(grid) { vista.pintarPowerUps(grid); ctl.datos.asegurar().then(() => { if (grid.classList.contains('pu')) vista.pintarPowerUps(grid); }); },
  celebrate: (cat, it) => vista.celebrar({ tipo: it.secret ? 'secreto' : 'articulo', cat, it }),
  arcadeBest(n) { cuenta.mejorArcade = n; },
  arcadeBestText: (h) => (h > cuenta.mejorArcade ? '⚡ ¡Nuevo récord Arcade!' : `Tu récord Arcade: ${cuenta.mejorArcade}`),
};
