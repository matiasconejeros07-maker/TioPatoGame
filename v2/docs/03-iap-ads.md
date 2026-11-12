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

- **App Store Connect:** crea los 4 packs como *consumibles* con los mismos ids de `shared/catalog.js`. En *Usuarios y acceso → Integraciones → Compras dentro de la app* genera una clave: de ahí salen `APPLE_ISSUER_ID`, `APPLE_KEY_ID` y el archivo `.p8` (`APPLE_PRIVATE_KEY`).
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

- **Los decide el controlador de estados.** `GameFlowModel` no tiene transición de `PLAYING` a `AD_BREAK`: un anuncio encima de una partida es imposible por construcción, no por cuidado.
- **Nunca hacen esperar.** El anuncio se carga en segundo plano durante la partida; si no está listo al terminar, se salta.
- **Política (`AdPolicyModel`, ajustable):** sin anuncios en las 2 primeras partidas de la sesión; después, como mucho uno cada 3 partidas y nunca dos en menos de 2,5 minutos; tampoco tras una partida de menos de 12 segundos.
- **Si AdMob falla, el juego sigue.** Ningún error de anuncios llega al jugador.

Configura en AdMob un bloque *intersticial* por plataforma y pasa su id a `AdMobAdsService`. En `AndroidManifest.xml` e `Info.plist` va el id de la app de AdMob (lo pide el plugin al instalarlo).

## Privacidad (GDPR / CCPA)

`ConsentController` corre en el primer arranque, **antes** de inicializar AdMob:

1. consulta el estado con la plataforma de consentimiento de Google (UMP);
2. si la región lo exige, muestra el formulario;
3. solo si el resultado permite pedir anuncios se inicializa AdMob. Si el jugador rechaza o algo falla, se juega sin anuncios.

En Ajustes debe ir el botón «Opciones de privacidad» cuando `privacyOptionsRequired` sea verdadero (lo exige Google para poder cambiar la decisión). Los mensajes se crean en AdMob → *Privacidad y mensajes* (uno para Europa, otro para los estados de EE. UU.; el de iOS incluye el permiso de seguimiento de Apple).

## Eliminar cuenta

`DELETE /v2/account` (Ajustes → «Eliminar cuenta», con confirmación en la vista):

- borra la cuenta y todo lo suyo: saldo, inventario, racha, récords, identidad SSO, dispositivo y sesiones;
- conserva las compras con dinero real **sin dueño** (obligación contable y control de fraude) y un rastro sin datos personales de que la solicitud se cumplió;
- libera el dispositivo, así la persona puede volver a empezar.

Pendientes para la revisión de las tiendas: (1) al eliminar una cuenta creada con *Sign in with Apple* hay que revocar su token con Apple (va con el inicio de sesión, paso 2); (2) Google Play pide además una **página web** donde solicitar la eliminación sin instalar la app; (3) quitar al jugador de los marcadores de Redis en la misma operación (paso 3).
