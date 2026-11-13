# 1 · Estructura del proyecto (M.V.C)

## La regla

- **Modelo:** solo datos. Getters y setters, y avisa cuando cambia. No decide nada. (Una prueba revisa que ningún modelo tenga métodos de lógica.)
- **Controlador:** toda la funcionalidad. Recibe los toques, aplica las reglas del juego, lee y escribe los modelos y llama a los servicios.
- **Vista:** dibuja lo que hay en los modelos y le avisa al controlador de los toques. No decide nada.
- **Servicios:** las puertas al mundo exterior (API, tiendas, AdMob, SSO, atestación). No tienen reglas del juego.

## Carpetas

```
v2/
├── app/                          La app (Capacitor: iOS y Android) y la web en Modo Práctica
│   ├── capacitor.config.json
│   ├── src/
│   │   ├── models/               MODELO (solo getters y setters)
│   │   │   ├── GameFlowModel.js      pantalla actual y modo de la partida
│   │   │   ├── SessionModel.js       sesión del jugador (o «práctica» en la web)
│   │   │   ├── ProfileModel.js       nombre y desde cuándo puede cambiarlo
│   │   │   ├── PowerUpModel.js       inventario de power-ups y los de la partida en curso
│   │   │   ├── EntitlementsModel.js  derechos permanentes («Sin anuncios»)
│   │   │   └── AdPolicyModel.js      cada cuántas partidas va un anuncio y cuántas van
│   │   ├── controllers/          CONTROLADOR (toda la lógica)
│   │   │   ├── GameFlowController.js transiciones entre pantallas, arranque, partidas, pausa de anuncios
│   │   │   ├── AuthController.js     inicio de sesión: SSO + atestación + cambio de teléfono + cuenta de la V1
│   │   │   ├── PowerUpController.js  reglas de los power-ups (10 s, 3 por partida, solo arcade) y su descuento
│   │   │   ├── PurchaseController.js compras con dinero real, con pesos, y «Restaurar compras»
│   │   │   ├── AdsController.js      interstitials: uno cada 5 partidas
│   │   │   ├── ConsentController.js  consentimiento GDPR/CCPA
│   │   │   └── ProfileController.js  cambiar nombre (30 días, filtro de groserías) y cuadro VIP
│   │   ├── views/                VISTA: AppView, MenuView, MatchView, GameOverView, ShopView, PanelsView, CelebrationView
│   │   ├── styles.css
│   │   ├── services/
│   │   │   ├── ports.js              contratos: qué necesita el juego de la plataforma
│   │   │   ├── ApiClient.js          cliente de la API; firma HMAC cada petición
│   │   │   └── adapters/             AppleSignIn, PlayGamesSignIn, AppAttest, PlayIntegrity, SecureSessionStore,
│   │   │                             AdMob, NativeStore, FirebaseLegacyAuth
│   │   ├── core/Emitter.js       avisos de los modelos
│   │   └── composition.js        conecta las piezas: createGame() (app) y createPracticeGame() (web)
│   ├── web/                      entrada de la demo jugable · build.mjs la empaqueta en dist/
│   └── test/
├── server/                       La API (Cloudflare Worker)
│   ├── src/
│   │   ├── controllers/          rutas HTTP: auth, purchases, matches, account, webhooks
│   │   ├── services/             casos de uso y terceros: AuthService, PurchaseService, attestors (Play Integrity,
│   │   │                         App Attest), identityProviders (Apple, Play Games), verificadores de tiendas, stores (Redis)
│   │   ├── repositories/         acceso a PostgreSQL, con transacciones
│   │   ├── middleware/signedRequest.js   firma HMAC, ventana de 30 s y anti-repetición
│   │   ├── app.js · index.js     armado de la API · entrada del Worker
│   ├── test/ · testing/
│   ├── wrangler.toml             variables
│   └── .dev.vars.example         secretos
├── shared/                       lo que comparten app y servidor
│   ├── ids.js                    ← bundle id, ids de productos y enlaces a las tiendas (EL archivo a editar)
│   ├── catalog.js                power-ups, packs, modos de partida, precios en pesos
│   ├── names.js · profanity.js   reglas del nombre y filtro de groserías
│   ├── devices.js                plazos de Device Binding y nonce de Android
│   └── signature.js              la fórmula de la firma
├── db/migrations/                esquema de PostgreSQL
├── infra/cloudflare/             reglas del WAF y límites de frecuencia
├── migracion/                    Firebase → PostgreSQL + Redis
└── docs/
```

En el servidor no hay carpeta `models/`: lo que guarda datos es PostgreSQL, y el código que lo lee y escribe (con sus transacciones) está en `repositories/`, porque tiene lógica y por tu regla eso no es un modelo. Los controladores del servidor reciben la petición y delegan en servicios y repositorios.

## Cómo se aplica SOLID

- **Una responsabilidad por archivo.** `AdsController` decide cuándo va un anuncio; `AdMobService` es lo único que sabe hablar con AdMob.
- **Abierto a extensión.** Un pack nuevo es una línea en `shared/catalog.js`; otra red de anuncios, otra tienda u otro SSO es un adaptador nuevo.
- **Dependencias invertidas.** Los controladores reciben contratos (`services/ports.js`), no plugins. Por eso se prueban sin teléfono.
- **Contratos chicos.** Consentimiento, anuncios, tienda, identidad, atestación y almacén de sesión son contratos separados.

## Identificadores

Todo está en **`shared/ids.js`**: `APP_ID` (`com.miempresa.pingpong`), los productos (`.pack1` a `.pack4` y `.sinanuncios`) y los enlaces a las tiendas. Al tener los definitivos se cambia ese archivo y `app/capacitor.config.json` (una prueba falla si no coinciden). Las credenciales van en `server/wrangler.toml` (variables) y `server/.dev.vars.example` (secretos).

## Decisiones tomadas

| Tema | Decisión | Dónde está |
|---|---|---|
| Versión web | Solo «Modo Práctica»: sin sesión, progreso, tienda ni marcadores, con aviso para descargar la app | `createPracticeGame()`; el aviso se dibuja en el paso 4 |
| Device Binding | 1 dispositivo = 1 cuenta; cambio de teléfono una vez cada 30 días | `AuthRepository`, doc 04 |
| Ventaja de pago | Dos marcadores: **clásico** (sin power-ups de pago) y **arcade** (con power-ups) | `MatchMode`, `scores.mode`, claves `lb:classic:*` y `lb:arcade:*` |
| Power-ups | Con dinero real (packs) o con pesos del juego a $500.000 cada uno; los potenciadores de burbuja de la V1 siguen | doc 03 |
| Clave HMAC | De cada sesión, entregada tras la atestación; no va escrita en la app | doc 04 |

## A dónde va cada parte de la V1

| V1 | V2 |
|---|---|
| Física y bucle de la partida (`SPEED0`, `fitBall`, `padWidth`…) | `MatchController` + `MatchModel` (paso 4) |
| Potenciadores de burbuja (`PUPS`, `PUP_POINTS`) | se conservan en la partida, en los dos modos |
| `tienda.js` (catálogo y economía) | `shared/` |
| `dialogos.js` | datos en `shared/`, lógica en un controlador |
| HTML/CSS de cada pantalla | `app/src/views/` |
| Llamadas REST a Firebase y `firebase-rules.json` | `ApiClient` → Worker → PostgreSQL |

## Pasos

| Paso | Contenido | Estado |
|---|---|---|
| 1 | Estructura, base de datos, migración de Firebase, compras, «Sin anuncios», anuncios, consentimiento, cambiar nombre, eliminar cuenta, firma HMAC | hecho y probado |
| 2 | SSO (Apple, Play Games), atestación (App Attest, Play Integrity), Device Binding con cambio cada 30 días, WAF, reembolsos, uso de power-ups, compra con pesos, filtro de groserías, marcadores por modo, Modo Práctica | hecho y probado con dobles; falta probar en teléfonos reales |
| 3 | Partidas y economía en el servidor (cobro, tienda con pesos, racha, logros, objetivos) y marcadores en Redis | **falta en el servidor**; la demo lo simula en el navegador (`DemoApi`) |
| 4 | Partida, vistas, interfaz premium, tienda y marcadores nuevos, puntos rojos y animaciones | hecho en la demo (doc 05); faltan partes de la V1 listadas ahí |
| 5 | Sección Power-Ups de la tienda (packs animados) y botón de activación en la partida | hecho en la demo |
| 6 | Audio: música de fondo y sonidos de rebote equipables | hecho en la demo |
| 7 | App nativa: proyectos de Capacitor, adaptadores reales y pruebas en teléfonos | pendiente |
