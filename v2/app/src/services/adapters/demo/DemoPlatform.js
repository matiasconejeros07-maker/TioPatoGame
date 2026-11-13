// Servicios de plataforma de DEMOSTRACIÓN para probar el juego completo en un navegador: no hay AdMob, ni tiendas,
// ni SSO, ni atestación. Cada uno cumple el mismo contrato (services/ports.js) que su adaptador nativo.
import { PACKS, PERMANENT } from '../../../../../shared/catalog.js';

const DEMO_PRICES = ['$990', '$1.990', '$3.990', '$7.990', '$2.490'];

/** Pantalla simple encima del juego; se resuelve con el valor del botón que toque el jugador. */
function overlay(html, { autoCloseMs } = {}) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'demo-layer';
    layer.innerHTML = html;
    const done = (value) => { layer.remove(); resolve(value); };
    layer.addEventListener('click', (e) => { const button = e.target.closest('[data-value]'); if (button && !button.disabled) done(button.dataset.value); });
    document.body.appendChild(layer);
    if (autoCloseMs) {
      const button = layer.querySelector('[data-value]'), label = button.textContent;
      let left = Math.ceil(autoCloseMs / 1000);
      button.disabled = true; button.textContent = `${label} (${left})`;
      const timer = setInterval(() => { left -= 1; if (left <= 0) { clearInterval(timer); button.disabled = false; button.textContent = label; } else button.textContent = `${label} (${left})`; }, 1000);
    }
  });
}

export function createDemoPlatform({ storage = globalThis.localStorage } = {}) {
  const read = (key) => { try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; } };
  const write = (key, value) => { try { value === null ? storage?.removeItem(key) : storage?.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } };
  const ids = [...Object.keys(PACKS), ...Object.keys(PERMANENT)];

  return {
    platform: 'android',
    consent: { async gather() { return { canRequestAds: true, privacyOptionsRequired: false }; }, async showPrivacyOptions() {} },
    ads: {
      async initialize() {},
      async loadInterstitial() { return true; },
      showInterstitial: () => overlay(`
        <div class="demo-ad"><span class="demo-tag">Anuncio de prueba</span>
          <b>Aquí va un anuncio de AdMob</b><p>Sale uno cada 5 partidas. Con «Sin anuncios» no aparece.</p>
          <button class="btn" data-value="close">Cerrar</button></div>`, { autoCloseMs: 3000 }),
    },
    store: {
      async getProducts(wanted) { return wanted.filter((id) => ids.includes(id)).map((productId) => ({ productId, priceLabel: DEMO_PRICES[ids.indexOf(productId)] })); },
      async purchase(productId) {
        const name = (PACKS[productId] ?? PERMANENT[productId]).name;
        const answer = await overlay(`
          <div class="demo-sheet"><span class="demo-tag">Compra de prueba</span>
            <b>${name}</b><p>En la app real esto lo cobra Google Play o el App Store. Aquí no se cobra nada.</p>
            <button class="btn gold" data-value="buy">Comprar · ${DEMO_PRICES[ids.indexOf(productId)]}</button>
            <button class="btn ghost" data-value="cancel">Cancelar</button></div>`);
        return answer === 'buy' ? { store: 'google', productId, purchaseToken: 'demo-' + Date.now() } : null;
      },
      async pendingPurchases() { return []; },
      async restorablePurchases() { return []; },
      async finish() {},
    },
    identity: { async signIn() { return { demo: true }; } },
    attestation: { canRenew: false, async attest() { return { demo: true }; } },
    sessionStore: {
      async load() { const s = read('tiopato-demo-session'); return s ? { ...s, key: new Uint8Array(1) } : null; },
      async save({ id, userId }) { write('tiopato-demo-session', { id, userId }); },
      async clear() { write('tiopato-demo-session', null); },
    },
    legacyAuth: { async signIn() { throw new Error('no disponible en la demo'); } },
    preferences: { load: () => read('tiopato-demo-prefs') ?? {}, save: (prefs) => write('tiopato-demo-prefs', prefs) },
  };
}
