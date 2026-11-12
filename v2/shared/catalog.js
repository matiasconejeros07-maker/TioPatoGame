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
