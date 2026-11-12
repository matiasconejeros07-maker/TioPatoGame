// Catálogo de dinero real: lo leen la app (para dibujar la tienda) y el servidor (para saber qué entregar).
// Los precios NO van aquí: los fija cada tienda (App Store Connect / Play Console) y la app los muestra
// tal como los devuelve la tienda, en la moneda del jugador.

/** Reglas de negocio de los power-ups de pago. */
export const POWERUP_RULES = Object.freeze({ durationMs: 10_000, maxPerMatch: 3 });

/** Los ids de efecto `slow`, `freeze` y `wide` son los potenciadores de la V1 (burbujas, hielo, barra grande). */
export const POWERUPS = Object.freeze({
  slow:   { name: 'Burbujas',      icon: '🫧' },
  freeze: { name: 'Hielo cristal', icon: '❄️' },
  wide:   { name: 'Barra grande',  icon: '📏' },
});

/** Packs de ofertas. El id es el mismo `productId` que se crea (como consumible) en las dos tiendas. */
export const PACKS = Object.freeze({
  'cl.tiopato.pack.inicial': { name: 'Pack Inicial',     grants: { slow: 3, wide: 2 } },
  'cl.tiopato.pack.hielo':   { name: 'Pack Hielo',       grants: { freeze: 5 } },
  'cl.tiopato.pack.pro':     { name: 'Pack Pro',         grants: { slow: 6, freeze: 6, wide: 6 } },
  'cl.tiopato.pack.mega':    { name: 'Pack Millonario',  grants: { slow: 15, freeze: 15, wide: 15 } },
});

export const packOf = (productId) => (Object.hasOwn(PACKS, productId) ? PACKS[productId] : null);

/** Derechos permanentes que puede tener una cuenta. */
export const Entitlement = Object.freeze({ NO_ADS: 'no_ads' });

/** Compras permanentes (no consumibles en las tiendas): se pagan una vez y se pueden restaurar. */
export const PERMANENT = Object.freeze({
  'cl.tiopato.sinanuncios': { name: 'Sin anuncios', entitlement: Entitlement.NO_ADS },
});

/** Cada cuántas partidas sale un anuncio (para quien no compró «Sin anuncios»). */
export const AD_EVERY_MATCHES = 5;

/** @returns {{ consumable: true, grants: Record<string, number> } | { consumable: false, entitlement: string } | null} */
export function productOf(productId) {
  if (Object.hasOwn(PACKS, productId)) return { consumable: true, grants: PACKS[productId].grants };
  if (Object.hasOwn(PERMANENT, productId)) return { consumable: false, entitlement: PERMANENT[productId].entitlement };
  return null;
}
