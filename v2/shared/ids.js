// ─────────────────────────────────────────────────────────────────────────────────────────────
//  IDENTIFICADORES DE LAS TIENDAS · el único archivo que hay que editar al tener los definitivos.
//  Los leen la app y el servidor. `app/capacitor.config.json` debe llevar el mismo APP_ID
//  (una prueba lo comprueba), igual que los proyectos de Xcode y Android Studio.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Bundle ID (iOS) y nombre de paquete (Android). */
export const APP_ID = 'com.miempresa.pingpong';

/** Productos de compra dentro de la app: los mismos ids en App Store Connect y en Play Console. */
export const PRODUCT_IDS = Object.freeze({
  pack1: `${APP_ID}.pack1`,
  pack2: `${APP_ID}.pack2`,
  pack3: `${APP_ID}.pack3`,
  pack4: `${APP_ID}.pack4`,
  noAds: `${APP_ID}.sinanuncios`,
});

/** Enlaces a las tiendas (aviso del Modo Práctica de la versión web). */
export const STORE_LINKS = Object.freeze({
  ios: 'https://apps.apple.com/app/id0000000000',
  android: `https://play.google.com/store/apps/details?id=${APP_ID}`,
});
