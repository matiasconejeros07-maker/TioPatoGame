// CONTROLADORES de la V2: toda la lógica nueva. Hablan con el juego de la V1 a través del puente (`api`),
// leen y escriben los modelos y le piden a la vista que muestre cosas. No tocan el DOM directamente.
import { checkName, NAME_CHANGE_DAYS } from '../../shared/names.js';

const DIA = 86_400_000;
const CFG = () => (window.TIENDA && window.TIENDA.v2) || {};
const PREFS_KEY = 'gana-al-tio-pato-v2-prefs';

/** Carga y guarda lo de la cuenta y las preferencias del teléfono. */
export class DatosController {
  constructor({ api, cuenta, prefs }) {
    Object.assign(this, { api, cuenta, prefs });
    try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); prefs.musica = p.musica !== false; prefs.consentimiento = p.consentimiento ?? null; prefs.partidasSinAnuncio = +p.partidasSinAnuncio || 0; prefs.modo = p.modo === 'arcade' ? 'arcade' : 'classic'; } catch (e) {}
    prefs.on('cambio', () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ musica: prefs.musica, consentimiento: prefs.consentimiento, partidasSinAnuncio: prefs.partidasSinAnuncio, modo: prefs.modo })); } catch (e) {} });
  }
  get conSesion() { return !!(this.api.AUTH && this.api.session); }
  /** Trae v2/<uid> si cambió la cuenta (o si se pide de nuevo). */
  async asegurar(forzar = false) {
    const s = this.api.session;
    if (!s) { this.cuenta.uid = null; this.cuenta.powerUps = {}; this.cuenta.sinAnuncios = false; this.cuenta.nombreCambiadoEn = 0; this.cuenta.mejorArcade = 0; return; }
    if (this.cuenta.uid === s.uid && !forzar) return;
    this.cuenta.uid = s.uid;
    try {
      const [v, a] = await Promise.all([this.api.get('v2/' + s.uid), this.api.get('arcade/' + s.uid + '/s').catch(() => 0)]);
      this.cuenta.powerUps = (v && v.pu) || {}; this.cuenta.sinAnuncios = !!(v && v.na); this.cuenta.nombreCambiadoEn = (v && v.nc) || 0; this.cuenta.mejorArcade = +a || 0;
    } catch (e) { /* sin conexión: queda lo que había */ }
  }
}

/** Power-ups de pago: compra (dinero real o pesos) y uso en partidas Arcade (10 s, máximo 3 por partida). */
export class PowerUpController {
  constructor({ api, cuenta, partida, vista, audio }) { Object.assign(this, { api, cuenta, partida, vista, audio }); }
  get catalogo() { return CFG().powerups || {}; }
  get precioPesos() { return CFG().precioPesos || 500000; }
  get porPartida() { return CFG().porPartida || 3; }
  get restantes() { return this.porPartida - this.partida.usados.length; }

  /** ¿Por qué no se puede activar ahora? (null = se puede) */
  motivo(k) {
    if (this.partida.modo !== 'arcade') return 'Solo en partidas Arcade';
    if (this.api.state !== 'play') return 'Espera a que salga la pelota';
    if (this.partida.usados.length >= this.porPartida) return `Máximo ${this.porPartida} por partida`;
    if (this.api.pupLeft(k) > 0) return 'Ya está activo';
    if ((this.cuenta.powerUps[k] || 0) < 1) return 'No te quedan';
    return null;
  }
  /** El jugador lo toca: el efecto empieza al tiro y el servidor lo descuenta en ese mismo momento. */
  async usar(k) {
    const m = this.motivo(k);
    if (m) { this.vista.aviso(m); return false; }
    if (!this.api.activatePup(k)) return false;
    const pu = this.cuenta.powerUps; pu[k] -= 1; this.cuenta.powerUps = pu;
    this.partida.usados = [...this.partida.usados, k];
    try { await this.api.patch({ [`v2/${this.cuenta.uid}/pu/${k}`]: pu[k] }); } catch (e) { /* se reintenta al sincronizar */ }
    return true;
  }
  /** Un power-up con pesos del juego. El descuento de pesos y la entrega van juntos en una sola escritura. */
  async comprarConPesos(k) {
    const precio = this.precioPesos, w = this.api.wallet;
    if (this.api.balance() < precio) { this.vista.aviso(`Te faltan ${this.api.money(precio - this.api.balance())}`); return false; }
    const pu = this.cuenta.powerUps; pu[k] = (pu[k] || 0) + 1;
    try { await this.api.patch({ [`wallets/${this.cuenta.uid}/sp`]: w.sp + precio, [`v2/${this.cuenta.uid}/pu/${k}`]: pu[k] }); }
    catch (e) { this.vista.aviso('No se pudo comprar. Revisa tu conexión.'); return false; }
    this.cuenta.powerUps = pu; await this.api.pullWallet(); this.api.renderCoins();
    this.audio.efecto('compra');
    await this.vista.celebrar({ tipo: 'pack', titulo: '¡' + this.catalogo[k].n + '!', da: { [k]: 1 } });
    return true;
  }
}

/** Compras con dinero real. En la app las cobra Google Play / App Store y las entrega el servidor tras validarlas; en la demo es una compra de prueba. */
export class ComprasController {
  constructor({ api, cuenta, vista, audio }) { Object.assign(this, { api, cuenta, vista, audio }); }
  get packs() { return CFG().packs || []; }
  get sinAnuncios() { return CFG().sinAnuncios; }
  async comprar(producto) {
    if (!(await this.vista.hojaDeCompra(producto))) return false;           // el jugador canceló
    const patch = {};
    if (producto.da) { const pu = this.cuenta.powerUps; for (const k in producto.da) pu[k] = (pu[k] || 0) + producto.da[k]; for (const k in pu) patch[`v2/${this.cuenta.uid}/pu/${k}`] = pu[k]; }
    else patch[`v2/${this.cuenta.uid}/na`] = true;
    try { await this.api.patch(patch); } catch (e) { this.vista.aviso('Compra pendiente: se entregará cuando vuelva la conexión.'); return false; }
    if (producto.da) { const pu = this.cuenta.powerUps; for (const k in producto.da) pu[k] = (pu[k] || 0) + producto.da[k]; this.cuenta.powerUps = pu; }
    else this.cuenta.sinAnuncios = true;
    this.audio.efecto('fanfarria');
    await this.vista.celebrar(producto.da ? { tipo: 'pack', titulo: producto.n, da: producto.da } : { tipo: 'sinanuncios', titulo: producto.n });
    return true;
  }
  async restaurar() { this.vista.aviso(this.cuenta.sinAnuncios ? '«Sin anuncios» ya está activo en tu cuenta.' : 'No hay compras que restaurar.'); }
}

/** Anuncios: uno cada 5 partidas para todos, salvo quien compró «Sin anuncios». Solo entre partidas. */
export class AnunciosController {
  constructor({ cuenta, prefs, vista }) { Object.assign(this, { cuenta, prefs, vista }); }
  get cada() { return CFG().anuncioCada || 5; }
  /** Al abrir el juego por primera vez: el consentimiento de privacidad (GDPR/CCPA), antes de cualquier anuncio. */
  async pedirConsentimiento() { if (this.prefs.consentimiento === null) this.prefs.consentimiento = await this.vista.consentimiento(); }
  partidaTerminada() { if (!this.cuenta.sinAnuncios) this.prefs.partidasSinAnuncio = this.prefs.partidasSinAnuncio + 1; }
  /** Al salir del resumen de la partida (a jugar de nuevo, al menú, a la tienda…). */
  async pausa() {
    if (this.cuenta.sinAnuncios || this.prefs.partidasSinAnuncio < this.cada) return;
    await this.pedirConsentimiento();
    await this.vista.anuncio(this.prefs.consentimiento === 'si');
    this.prefs.partidasSinAnuncio = 0;
  }
}

/** Nombre: único, sin groserías y una vez cada 30 días. */
export class NombreController {
  constructor({ api, cuenta, vista }) { Object.assign(this, { api, cuenta, vista }); }
  problema(nombre) { const r = checkName(nombre); return r.problem === 'nombre_ofensivo' ? 'Ese nombre no está permitido. Elige otro.' : r.problem ? 'Usa de 3 a 12 letras o números.' : null; }
  get proximoCambio() { return this.cuenta.nombreCambiadoEn ? this.cuenta.nombreCambiadoEn + NAME_CHANGE_DAYS * DIA : 0; }
  get diasQueFaltan() { return Math.max(0, Math.ceil((this.proximoCambio - Date.now()) / DIA)); }
  async cambiar(nombre) {
    const r = checkName(nombre);
    if (r.problem) return this.problema(nombre);
    if (this.diasQueFaltan > 0) return `Podrás cambiarlo en ${this.diasQueFaltan} ${this.diasQueFaltan === 1 ? 'día' : 'días'}.`;
    if (r.key === this.api.session.key) return 'Ese ya es tu nombre.';
    const res = await this.api.changeName(r.displayName);
    if (res === 'taken') return 'Ese nombre ya lo tiene otro jugador.';
    if (res === 'mail') return 'Primero asocia un correo a tu cuenta (Ajustes → Correo).';
    if (res !== 'ok') return 'Sin conexión. Inténtalo de nuevo.';
    const ahora = Date.now();
    try { await this.api.patch({ [`v2/${this.cuenta.uid}/nc`]: { '.sv': 'timestamp' } }); } catch (e) {}
    this.cuenta.nombreCambiadoEn = ahora;
    return null;
  }
}

/** Sonido: música de fondo y el sonido de rebote equipado. */
export class SonidoController {
  constructor({ api, prefs, servicio }) {
    Object.assign(this, { api, prefs, servicio });
    const desbloquear = () => { if (this.servicio.unlock()) this.#musica(); };
    addEventListener('pointerdown', desbloquear, { once: false, passive: true });
    prefs.on('cambio', () => this.#musica());
  }
  #musica() { if (this.prefs.musica && this.api.soundOn()) this.servicio.startMusic(); else this.servicio.stopMusic(); }
  sincronizar() { this.#musica(); }
  rebote(hits) {
    if (!this.api.soundOn()) return true;                   // apagado: el juego no debe tocar su «tic» tampoco
    const id = (this.api.wallet.eq && this.api.wallet.eq.sfx) || 'clasico';
    if (!this.servicio.unlock()) return false;
    this.servicio.bounce(id, Math.min(hits, 60) / 60);
    return true;
  }
  probar(id) { this.servicio.unlock(); this.servicio.bounce(id, 0); }
  efecto(n) { if (this.api.soundOn() && this.servicio.unlock()) this.servicio.play({ compra: 'buy', fanfarria: 'fanfare', revelar: 'reveal', moneda: 'coin' }[n] || n); }
}
