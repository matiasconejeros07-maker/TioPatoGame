# 1 · Estructura del proyecto (M.V.C)

## Carpetas

```
v2/
├── app/                        La app (Capacitor: iOS y Android)
│   ├── src/
│   │   ├── models/             MODELO: estado y reglas del juego. No conoce pantallas ni plugins.
│   │   │   ├── GameFlowModel.js      estados (menú, partida, pausa de anuncios…) y transiciones válidas
│   │   │   ├── AdPolicyModel.js      cuándo corresponde un anuncio
│   │   │   └── PowerUpModel.js       inventario y reglas: 10 s exactos, máximo 3 por partida
│   │   ├── views/              VISTA: dibuja y avisa de los toques. No decide nada. (paso 4)
│   │   ├── controllers/        CONTROLADOR: recibe los toques, usa los modelos y los servicios
│   │   │   ├── GameFlowController.js controlador de estados: arranque, partidas, pausa de anuncios
│   │   │   ├── ConsentController.js  consentimiento GDPR/CCPA
│   │   │   ├── AdsController.js      interstitials entre partidas
│   │   │   └── PurchaseController.js compras con dinero real
│   │   ├── services/           puertas al mundo exterior
│   │   │   ├── ports.js              contratos (qué necesita el juego de la plataforma)
│   │   │   ├── ApiClient.js          cliente de la API, firma HMAC cada petición
│   │   │   └── adapters/             implementaciones: AdMobService.js, NativeStoreService.js
│   │   ├── core/Emitter.js     avisos de los modelos a vistas y controladores
│   │   └── composition.js      el único lugar donde se conectan las piezas concretas
│   └── test/
├── server/                     La API (Cloudflare Worker)
│   ├── src/
│   │   ├── controllers/        rutas HTTP: purchasesController.js, accountController.js
│   │   ├── models/             acceso a PostgreSQL: PurchaseRepository, AccountRepository, SessionRepository
│   │   ├── services/           casos de uso y terceros: PurchaseService, AppleStoreVerifier,
│   │   │                       GooglePlayVerifier, FirebaseTokenVerifier, NonceStore, jwt.js
│   │   ├── middleware/signedRequest.js   firma HMAC, ventana de 30 s y anti-repetición
│   │   ├── app.js              arma la API con sus dependencias
│   │   └── index.js            entrada del Worker (servicios reales)
│   ├── test/
│   └── wrangler.toml
├── shared/                     lo que comparten app y servidor
│   ├── signature.js            la fórmula de la firma (una sola implementación)
│   └── catalog.js              power-ups, packs y sus reglas
├── db/migrations/              esquema de PostgreSQL
├── migracion/                  Firebase → PostgreSQL + Redis
└── docs/
```

En el servidor, la «Vista» es la respuesta JSON; por eso solo tiene controladores (HTTP), modelos (datos) y servicios (casos de uso).

## Cómo se aplica SOLID

- **Una responsabilidad por archivo.** `AdPolicyModel` decide *si* toca un anuncio; `AdsController` decide *cuándo* pedirlo y mostrarlo; `AdMobService` es lo único que sabe hablar con AdMob.
- **Abierto a extensión.** Un pack o un power-up nuevo es una línea en `shared/catalog.js`; otra red de anuncios u otra tienda es un adaptador nuevo, sin tocar controladores.
- **Dependencias invertidas.** Los controladores reciben contratos (`services/ports.js`), no plugins. Por eso se prueban sin teléfono, y por eso las pruebas del servidor reemplazan a Apple y Google por dobles.
- **Contratos chicos.** `ConsentService`, `AdsService` y `StoreService` están separados aunque AdMob implemente dos de ellos.

## A dónde va cada parte de la V1

La V1 es un solo `index.html` de ~418 KB con todo mezclado. Este es el destino de cada parte:

| V1 | V2 |
|---|---|
| Física y bucle de la partida (`SPEED0`, `fitBall`, `padWidth`…) | `app/src/models/MatchModel.js` (paso 4) |
| Potenciadores de burbuja (`PUPS`, `PUP_POINTS`) | se conservan dentro de `MatchModel`; los de pago son `PowerUpModel.js` |
| `tienda.js` (catálogo y economía) | `shared/` (lo leen app y servidor; ya no hay reglas de Firebase que regenerar) |
| `dialogos.js` | `app/src/models/DialogueModel.js` |
| HTML/CSS de cada pantalla | `app/src/views/` (una vista por pantalla) |
| Llamadas REST a Firebase | `ApiClient` → Worker → PostgreSQL |
| `firebase-rules.json` (validación) | controladores y servicios del servidor, con transacciones |
| Sonidos (`tone()`) | `app/src/services/AudioService.js` (paso 6) |

## Decisiones que cambian respecto de lo pedido (y por qué)

1. **La clave de la firma HMAC es de cada sesión, no una clave fija dentro de la app.** Una clave escrita en el código de la app se extrae del APK en minutos y deja de proteger. En cambio, el servidor entrega una clave por sesión al iniciar sesión (después de la atestación), y la app la guarda en el Keystore/Keychain. La fórmula es exactamente la pedida: `HMAC-SHA256(Body + Timestamp + Nonce, clave)`, se rechaza un desfase mayor a 30 s y cada nonce vale una sola vez.
2. **La V2 corre como app nativa, no como web.** La atestación de hardware, el Device Binding, Play Games y las compras nativas no existen en un navegador. Ver «Decisiones pendientes».

## Pasos

| Paso | Contenido | Estado |
|---|---|---|
| 1 | Estructura, esquema de la base, migración de Firebase, compras, anuncios, consentimiento, eliminar cuenta, firma HMAC | **hecho y probado** (este paso) |
| 2 | Inicio de sesión con Apple y Play Games, atestación (Play Integrity / App Attest), Device Binding, Cloudflare WAF | pendiente |
| 3 | Partidas y economía en el servidor (cobro, tienda, racha, ruleta, misiones) y marcadores en Redis | pendiente |
| 4 | Pasar el juego de `index.html` a modelos y vistas; interfaz premium, tienda y marcadores nuevos, puntos rojos | pendiente |
| 5 | Sección Power-Ups de la tienda (packs animados) y botón de activación en la partida | pendiente |
| 6 | Audio: música de fondo y sonidos de rebote equipables | pendiente |

Lo que el paso 1 **no** incluye todavía: el inicio de sesión (las pruebas crean las sesiones directo en la base), el descuento de power-ups al usarlos en una partida y las pantallas.

## Decisiones pendientes (son tuyas)

1. **¿Qué pasa con la versión web?** Hoy el juego se juega en el navegador. Con atestación y Device Binding obligatorios, la web no puede competir en los marcadores ni comprar. Opciones: cerrar la web el día del corte y dejar un aviso con los enlaces a las tiendas (recomendado), o mantenerla como «modo práctica» sin cuenta ni marcador.
2. **Una cuenta vive en un solo ecosistema.** Play Games no existe en iOS, así que quien entra con Play Games no puede pasar su cuenta a un iPhone (ni al revés), salvo que más adelante se permita enlazar las dos identidades a la misma cuenta.
3. **Device Binding y teléfonos compartidos.** «1 dispositivo = 1 cuenta» significa que dos hermanos con un mismo teléfono comparten cuenta. También hay que definir el cambio de teléfono (propuesta: se permite mover la cuenta a un teléfono nuevo una vez cada 30 días).
4. **Los identificadores son provisorios.** `cl.tiopato.juego` y los productos `cl.tiopato.pack.*` hay que cambiarlos por los reales de las tiendas.
