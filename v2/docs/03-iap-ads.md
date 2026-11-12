# 3 · Compras (IAP), anuncios y cumplimiento de tiendas

## Compras con dinero real

Plugin: `@capgo/native-purchases` (StoreKit 2 en iOS, Google Play Billing en Android). Todo pago con dinero real pasa por la tienda del teléfono; el juego no maneja tarjetas.

```
Jugador        App (PurchaseController)        Tienda del teléfono         API (PurchaseService)          Apple / Google
  │ toca «Comprar» ─▶ store.purchase(pack, idDeCuenta) ─▶ cobra
  │                                              ◀── compra PENDIENTE (sin cerrar)
  │                   POST /v2/purchases (firmada) ─────────────────────▶ 1. ¿el pack existe?
  │                                                                      2. pregunta a la tienda ─────▶ ¿existe, está pagada, es de esta
  │                                                                         ◀──────────────────────── app, este pack y esta cuenta?
  │                                                                      3. transacción: compra + inventario + libro
  │                                                                      4. Android: la consume en Google Play
  │                   ◀──────────────────────────────────────────────── inventario nuevo
  │                   iOS: finishTransaction
  │ ◀ power-ups en pantalla (solo con la respuesta del servidor)
```

### Por qué no sirven Lucky Patcher ni IAP Cracker

Esas herramientas engañan a **la app**: le hacen creer que la tienda aprobó una compra. Aquí la app no decide nada:

- El servidor no recibe un «recibo» para creerle; recibe un identificador y **le pregunta a Apple o a Google** si esa compra existe (`AppleStoreVerifier`, `GooglePlayVerifier`). Una compra inventada no existe en sus servidores → `422 compra_invalida`.
- La compra tiene que ser de esta app, de ese pack, estar pagada (no pendiente ni reembolsada) y haberse hecho **para esa cuenta** (`appAccountToken` en iOS, `obfuscatedExternalAccountId` en Android). No se puede cobrar la compra de otro.
- Cada transacción se entrega **una sola vez**: `UNIQUE (store, transaction_id)` en PostgreSQL. Reenviar la misma compra, incluso dos veces a la vez, no duplica nada.
- La compra, el inventario y el libro de movimientos se escriben en una transacción: o quedan los tres o ninguno.
- La app nunca se suma power-ups: el inventario en pantalla es lo que respondió el servidor.

### Si algo se corta a la mitad

| Qué pasó | Qué ocurre |
|---|---|
| Sin internet después de pagar | La compra queda pendiente en el teléfono; al abrir la app, `recoverPending()` la reenvía |
| El servidor entregó pero la respuesta no llegó | El reenvío devuelve el inventario sin entregar de nuevo |
| Google o Apple no responden | `503`; la compra sigue pendiente y se reintenta sola |
| El servidor entregó pero no pudo consumirla en Google | Queda anotado; el siguiente reenvío la consume sin entregar de nuevo |

### Qué tienes que configurar

- **App Store Connect:** crea los 4 packs como *consumibles* (y «Sin anuncios» como *no consumible*) con los mismos ids de `shared/catalog.js`. En *Usuarios y acceso → Integraciones → Compras dentro de la app* genera una clave: de ahí salen `APPLE_ISSUER_ID`, `APPLE_KEY_ID` y el archivo `.p8` (`APPLE_PRIVATE_KEY`).
- **Play Console:** crea los mismos 4 productos como *productos de pago único*. En Google Cloud crea una cuenta de servicio, dale en Play Console el permiso *Ver datos financieros y administrar pedidos*: de su JSON salen `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`.
- **Secretos del Worker:**
  ```bash
  npx wrangler secret put MASTER_SECRET
  ```
  ```bash
  npx wrangler secret put APPLE_PRIVATE_KEY
  ```
  ```bash
  npx wrangler secret put GOOGLE_PRIVATE_KEY
  ```
  ```bash
  npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
  ```
- **`ALLOW_SANDBOX`:** en producción va en `"false"` para que las compras gratis de prueba (TestFlight, compradores de prueba de Google) no entreguen power-ups reales. **Ponlo en `"true"` mientras Apple revisa la app**: los revisores compran en sandbox y, si la compra falla, rechazan la app.

### Falta (se agrega junto con el paso 3)

- **Reembolsos:** cuando Apple o Google devuelven el dinero, avisan al servidor (App Store Server Notifications V2 / Real-time Developer Notifications). Falta la ruta que recibe ese aviso y descuenta los power-ups. La columna `purchases.status` y el libro `powerup_ledger` ya lo contemplan.
- **Descuento al usar:** hoy el servidor suma power-ups al comprar; el descuento al usarlos va con el registro de partidas.

## Power-ups: reglas de negocio

Están en el modelo (`PowerUpModel.js`) y en `shared/catalog.js`, no en la vista:

- se obtienen solo comprando packs (no hay otra ruta que sume al inventario);
- se activan cuando el jugador quiere;
- duran **exactamente 10 000 ms** del reloj de la partida;
- **máximo 3 por partida**; un intento rechazado no gasta nada;
- no se apila el mismo power-up mientras está activo.

Nota de producto: como solo se consiguen pagando y ayudan a hacer más rebotes, quien paga tiene ventaja en los marcadores. Si quieres evitar la etiqueta «pay-to-win», la alternativa habitual es un marcador aparte para partidas sin power-ups.

## Anuncios

Plugin: `@capacitor-community/admob`. Solo interstitials, y solo en un punto: al salir del resumen de la partida.

- **Uno cada 5 partidas, para todos** los que no compraron «Sin anuncios» (`AD_EVERY_MATCHES` en `shared/catalog.js`).
- **Los decide el controlador de estados.** `GameFlowModel` no tiene transición de `PLAYING` a `AD_BREAK`: un anuncio encima de una partida es imposible por construcción.
- **No se salta el turno.** Si en la partida 5 no hay anuncio cargado (sin señal, AdMob sin anuncios disponibles), el juego sigue y el anuncio queda pendiente para la pausa siguiente.
- **Si AdMob falla, el juego sigue.** Ningún error de anuncios deja al jugador pegado.

Configura en AdMob un bloque *intersticial* por plataforma y pasa su id a `AdMobAdsService`. En `AndroidManifest.xml` e `Info.plist` va el id de la app de AdMob.

### «Sin anuncios»

Producto `cl.tiopato.sinanuncios`: una compra **permanente** (no consumible) que se valida en el servidor igual que los packs y queda como derecho `no_ads` de la cuenta (tabla `entitlements`).

- Quien lo tiene no ve anuncios ni el formulario de consentimiento; si lo compra a mitad de sesión, los anuncios se cortan de inmediato.
- **«Restaurar compras»** (`PurchaseController.restore()`): Apple lo exige para las compras permanentes; va como botón en Ajustes. Sirve al reinstalar o tras eliminar la cuenta y volver a empezar.
- La compra vale para **una cuenta del juego a la vez**: si se restaura en otra cuenta, se mueve a esa. Un pago no deja dos cuentas sin anuncios.
- En las tiendas: créalo como *no consumible* en App Store Connect y como *producto de pago único* en Play Console. El precio lo pones tú en cada tienda.

## Privacidad (GDPR / CCPA)

Todos ven anuncios, **acepten o rechacen** el consentimiento. Lo que cambia es el tipo de anuncio:

| Respuesta del jugador | Qué anuncios ve |
|---|---|
| Acepta | Personalizados |
| Rechaza | No personalizados o «limitados» (los elige Google) |
| Vive donde no hay que preguntar (p. ej. Chile) | No ve formulario; anuncios normales |
| Aún no responde el formulario | Ninguno todavía: el formulario vuelve a salir en cada pausa de anuncios hasta que responda |

El único caso sin anuncios es el último, y es obligatorio: en Europa no se puede pedir un anuncio antes de que la persona haya respondido, y el propio SDK de Google lo bloquea. La app no lo deja pasar de largo: insiste en cada pausa en que toca anuncio.

Dos límites que no dependen del código:
- A quien rechaza en Europa, Google le sirve menos anuncios (a veces ninguno disponible) y pagan menos.
- El formulario de Google trae el botón de rechazar; no se puede configurar un «acepta o no juegas».

Flujo (`AdsController.start()`): ¿tiene «Sin anuncios»? → si no, consentimiento con la plataforma de Google (UMP; muestra el formulario solo donde la ley lo exige) → AdMob → primer anuncio en carga.

En Ajustes debe ir el botón «Opciones de privacidad» cuando `privacyOptionsRequired` sea verdadero (lo exige Google para poder cambiar la decisión). Los mensajes se crean en AdMob → *Privacidad y mensajes* (uno para Europa, otro para los estados de EE. UU.; el de iOS incluye el permiso de seguimiento de Apple).

## Cambiar nombre

`PUT /v2/account/name` (Ajustes → «Cambiar nombre»):

- **una vez cada 30 días**; quien nunca lo ha cambiado (incluidas las cuentas que vienen de la V1) puede hacerlo de inmediato;
- de 3 a 12 caracteres y **único** sin distinguir mayúsculas ni tildes, igual que en la V1 («Matías» y «matias» son el mismo);
- el plazo lo decide el servidor (el reloj del teléfono no sirve para saltárselo) y dos intentos simultáneos logran un solo cambio;
- el nombre anterior queda libre para otro jugador;
- si aún no puede, el servidor responde la fecha desde la que podrá, para mostrar «faltan N días».

No hay filtro de palabras ofensivas; si lo quieres, dime con qué criterio.

## Eliminar cuenta

`DELETE /v2/account` (Ajustes → «Eliminar cuenta», con confirmación en la vista):

- borra la cuenta y todo lo suyo: saldo, inventario, racha, récords, identidad SSO, dispositivo y sesiones;
- conserva las compras con dinero real **sin dueño** (obligación contable y control de fraude) y un rastro sin datos personales de que la solicitud se cumplió;
- libera el dispositivo, así la persona puede volver a empezar.

Pendientes para la revisión de las tiendas: (1) al eliminar una cuenta creada con *Sign in with Apple* hay que revocar su token con Apple (va con el inicio de sesión, paso 2); (2) Google Play pide además una **página web** donde solicitar la eliminación sin instalar la app; (3) quitar al jugador de los marcadores de Redis en la misma operación (paso 3).
