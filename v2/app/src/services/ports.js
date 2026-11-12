// Contratos de los servicios de plataforma. Los Controladores dependen de estos contratos y no de un plugin
// concreto (inversión de dependencias): cambiar AdMob por otra red, o probar sin teléfono, es cambiar el adaptador.

/**
 * @typedef {object} ConsentService
 * @property {() => Promise<{ canRequestAds: boolean, privacyOptionsRequired: boolean }>} gather
 *   Pide (o recupera) el consentimiento GDPR/CCPA; muestra el formulario solo si hace falta.
 * @property {() => Promise<void>} showPrivacyOptions   Ajustes → «Opciones de privacidad».
 *
 * @typedef {object} AdsService
 * @property {() => Promise<void>} initialize
 * @property {() => Promise<boolean>} loadInterstitial  true si quedó listo para mostrarse
 * @property {() => Promise<void>} showInterstitial     se resuelve cuando el jugador cierra el anuncio
 *
 * @typedef {object} StoreProduct
 * @property {string} productId
 * @property {string} priceLabel   precio ya formateado por la tienda, en la moneda del jugador
 *
 * @typedef {object} StorePurchase
 * @property {'apple'|'google'} store
 * @property {string} productId
 * @property {string} [transactionId]   iOS
 * @property {string} [purchaseToken]   Android
 *
 * @typedef {object} StoreService
 * @property {(productIds: string[]) => Promise<StoreProduct[]>} getProducts
 * @property {(productId: string, userId: string) => Promise<StorePurchase|null>} purchase   null si el jugador canceló
 * @property {() => Promise<StorePurchase[]>} pendingPurchases   pagadas pero aún sin entregar
 * @property {(purchase: StorePurchase) => Promise<void>} finish  cierra la compra en el teléfono, ya entregada
 *
 * @typedef {object} Api
 * @property {(method: string, path: string, data?: object) => Promise<any>} request
 */
export {};
