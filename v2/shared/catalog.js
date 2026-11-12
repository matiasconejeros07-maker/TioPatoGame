// Catálogo de dinero real: lo leen la app (para dibujar la tienda) y el servidor (para saber qué entregar).
// Los precios NO van aquí: los fija cada tienda (App Store Connect / Play Console) y la app los muestra
// tal como los devuelve la tienda, en la moneda del jugador.

import { PRODUCT_IDS } from './ids.js';

/** Reglas de negocio de los power-ups de pago. */
export const POWERUP_RULES = Object.freeze({ durationMs: 10_000, maxPerMatch: 3 });

/** Los ids de efecto `slow`, `freeze` y `wide` son los potenciadores de la V1 (burbujas, hielo, barra grande). */
export const POWERUPS = Object.freeze({
  slow:   { name: 'Burbujas',      icon: '🫧' },
  freeze: { name: 'Hielo cristal', icon: '❄️' },
  wide:   { name: 'Barra grande',  icon: '📏' },
});

/** Packs de ofertas (consumibles en las dos tiendas). Los ids están en ids.js. */
export const PACKS = Object.freeze({
  [PRODUCT_IDS.pack1]: { name: 'Pack Inicial',     grants: { slow: 3, wide: 2 } },
  [PRODUCT_IDS.pack2]: { name: 'Pack Hielo',       grants: { freeze: 5 } },
  [PRODUCT_IDS.pack3]: { name: 'Pack Pro',         grants: { slow: 6, freeze: 6, wide: 6 } },
  [PRODUCT_IDS.pack4]: { name: 'Pack Millonario',  grants: { slow: 15, freeze: 15, wide: 15 } },
});

/**
 * Modos de partida, cada uno con su propio marcador:
 *  - classic: sin power-ups de pago (el ranking principal; nadie compra ventaja)
 *  - arcade:  con power-ups de pago
 */
export const MatchMode = Object.freeze({ CLASSIC: 'classic', ARCADE: 'arcade' });
export const isMatchMode = (mode) => mode === MatchMode.CLASSIC || mode === MatchMode.ARCADE;

export const packOf = (productId) => (Object.hasOwn(PACKS, productId) ? PACKS[productId] : null);

/** Derechos permanentes que puede tener una cuenta. */
export const Entitlement = Object.freeze({ NO_ADS: 'no_ads' });

/** Compras permanentes (no consumibles en las tiendas): se pagan una vez y se pueden restaurar. */
export const PERMANENT = Object.freeze({
  [PRODUCT_IDS.noAds]: { name: 'Sin anuncios', entitlement: Entitlement.NO_ADS },
});

/** Cada cuántas partidas sale un anuncio (para quien no compró «Sin anuncios»). */
export const AD_EVERY_MATCHES = 5;

/** @returns {{ consumable: true, grants: Record<string, number> } | { consumable: false, entitlement: string } | null} */
export function productOf(productId) {
  if (Object.hasOwn(PACKS, productId)) return { consumable: true, grants: PACKS[productId].grants };
  if (Object.hasOwn(PERMANENT, productId)) return { consumable: false, entitlement: PERMANENT[productId].entitlement };
  return null;
}

/** Un power-up también se puede comprar con pesos del juego, pero carísimo. */
export const POWERUP_COIN_PRICE = 500_000;
