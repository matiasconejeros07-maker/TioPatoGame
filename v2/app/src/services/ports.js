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
 * @property {() => Promise<StorePurchase[]>} restorablePurchases   compras permanentes de la cuenta de la tienda («Restaurar compras»)
 * @property {(purchase: StorePurchase) => Promise<void>} finish  cierra la compra en el teléfono, ya entregada
 *
 * @typedef {object} IdentityService   SSO oficial de la plataforma
 * @property {(challenge: string) => Promise<object>} signIn   credencial para el servidor; lanza { cancelled: true } si el jugador cierra el diálogo
 *
 * @typedef {object} AttestationService   atestación de hardware
 * @property {(challenge: string, options?: { renew?: boolean }) => Promise<object>} attest   prueba de que la app y el teléfono son genuinos
 * @property {boolean} canRenew   true si puede crear una clave nueva cuando el servidor no reconoce la guardada (iOS)
 *
 * @typedef {object} SessionStore   guarda la sesión en el Keystore / Keychain
 * @property {() => Promise<{ id: string, key: Uint8Array, userId: string } | null>} load
 * @property {(session: { id: string, key: Uint8Array, userId: string }) => Promise<void>} save
 * @property {() => Promise<void>} clear
 *
 * @typedef {object} LegacyAuthService   solo para reclamar cuentas de la V1
 * @property {(login: string, password: string) => Promise<string>} signIn   ID token de Firebase
 *
 * @typedef {object} Api
 * @property {(method: string, path: string, data?: object) => Promise<any>} request
 */
export {};
