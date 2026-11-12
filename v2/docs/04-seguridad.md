# 4 · Inicio de sesión, atestación, Device Binding y WAF

## Cómo encaja en M.V.C

```
VISTA (paso 4)            botón «Entrar» · aviso «tu cuenta está en otro teléfono» · «Ya tenía cuenta»
   │ toque
CONTROLADOR  AuthController      junta las pruebas y las manda; traduce la respuesta a un resultado para la vista
   │ usa                              (signed_in · confirm_device_change · device_change_wait · device_has_account · untrusted_device…)
   ├─ servicios  IdentityService      AppleSignInService (iOS) / PlayGamesSignInService (Android)
   │             AttestationService   AppAttestService (iOS) / PlayIntegrityService (Android)
   │             SessionStore         SecureSessionStore (Keystore / Keychain)
   │             ApiClient            /auth/* sin firma · todo lo demás firmado con HMAC
   └─ escribe    SessionModel, ProfileModel     (solo datos)

SERVIDOR  authController → AuthService ─┬─ ChallengeStore (Redis)        desafío de un solo uso
                                         ├─ attestors                     ¿app y teléfono genuinos?
                                         ├─ identityProviders             ¿quién es la persona?
                                         └─ AuthRepository (PostgreSQL)   Device Binding + sesión, en una transacción
```

La app nunca decide si un teléfono es de fiar ni si una cuenta puede entrar: junta pruebas firmadas por Apple o Google y el servidor las comprueba.

## El inicio de sesión, paso a paso

1. **Desafío.** `POST /auth/challenge` entrega un valor al azar, de un solo uso, que vence en 5 minutos.
2. **Atestación**, atada al desafío:
   - **Android (Play Integrity):** la app pide un veredicto con `nonce = SHA-256(desafío + id del teléfono)`. El servidor se lo manda a Google para descifrarlo y exige: app reconocida por Play (`PLAY_RECOGNIZED`: bloquea APK modificados o reempaquetados), teléfono íntegro (`MEETS_DEVICE_INTEGRITY`: bloquea emuladores, root y bootloader abierto), instalada desde Play (`LICENSED`), y que el veredicto sea de este intento, de este teléfono y reciente.
   - **iOS (App Attest):** la primera vez, el Secure Enclave crea una clave y Apple la certifica. El servidor comprueba la cadena de certificados hasta la raíz de Apple, que la atestación es de nuestra app y de este intento, y guarda la clave pública. Las veces siguientes basta con que el teléfono firme el desafío con esa clave; el contador de firmas solo puede subir (si no, la clave fue clonada). Un iPhone con jailbreak no puede fabricar una atestación válida.
3. **SSO**, también atado al desafío:
   - **iOS:** *Sign in with Apple*. El servidor verifica la firma de Apple, que el token sea para nuestra app y que lleve el desafío de este intento.
   - **Android:** *Google Play Games Services*. La app obtiene un código de un solo uso y el servidor lo canjea con Google por el id del jugador.
   - No hay registro con formulario ni correo. En cada plataforma solo vale su SSO.
4. **Device Binding y sesión** (una transacción en PostgreSQL), y el servidor responde la **clave HMAC de la sesión**, que la app guarda en el Keystore/Keychain.

Si cualquiera de los pasos falla, no hay sesión. Cuando falla la atestación, la app solo recibe `dispositivo_no_confiable`; el motivo exacto queda en los registros del servidor, para no darle pistas a quien prueba trampas.

## Device Binding

| Situación | Qué pasa |
|---|---|
| Identidad nueva en un teléfono sin cuenta | Se crea la cuenta y queda atada a ese teléfono |
| Identidad nueva en un teléfono que **ya tiene** cuenta | `dispositivo_con_otra_cuenta`: no se crea una segunda (no hay multicuentas) |
| Cuenta existente en **su** teléfono | Entra |
| Cuenta existente en un teléfono nuevo | La app avisa y pide confirmar. Al confirmar, la cuenta se mueve: el teléfono viejo queda fuera y su sesión deja de servir |
| Otro cambio antes de **30 días** | `cambio_de_dispositivo_en_espera`, con la fecha desde la que podrá |
| Cuenta existente en un teléfono que es de otra cuenta | `dispositivo_con_otra_cuenta` |
| Cuenta eliminada | El teléfono queda libre |

Además, cada cuenta tiene **una sola sesión viva**: iniciar sesión revoca la anterior.

Qué identifica al teléfono:
- **Android:** el `ANDROID_ID` (propio de ese teléfono y de nuestra app; sobrevive a reinstalar). Va dentro del nonce que Google certifica, así no se puede presentar el veredicto de un teléfono con el id de otro.
- **iOS:** el id de la clave de App Attest, guardado en el Keychain (que en iOS sobrevive a reinstalar).

**Límite honesto:** restablecer el teléfono de fábrica cambia esos identificadores, y el teléfono se ve como nuevo. Quien quiera una segunda cuenta así necesita además otra cuenta de Apple o de Play Games. Si más adelante hace falta cerrar ese caso, Google ofrece *device recall* en Play Integrity y Apple *DeviceCheck*, que recuerdan el teléfono incluso tras restablecerlo; se pueden sumar en `attestors.js` sin tocar el resto.

## Firma de las peticiones

Toda ruta bajo `/v2/` exige `X-Session`, `X-Timestamp`, `X-Nonce` y `X-Signature = HMAC-SHA256(Body + Timestamp + Nonce, clave de sesión)`. Se rechaza un desfase mayor a 30 s y cada nonce vale una sola vez. La clave se deriva de `MASTER_SECRET` y el id de sesión, así que el servidor no guarda claves.

Sin firma quedan solo: `/auth/*` (lo protegen la atestación, el desafío y el límite por IP), `/webhooks/*` (cada tienda se autentica a su manera) y `/health`.

## WAF de Cloudflare

Archivos en `infra/cloudflare/`. Para publicarlos:

```bash
CF_API_TOKEN=… CF_ZONE_ID=… API_HOST=api.midominio.com bash v2/infra/cloudflare/aplicar.sh
```

`aplicar.sh` **reemplaza** las reglas personalizadas de la zona; si ya tienes otras, agrégalas a los JSON antes.

**Reglas (`reglas-waf.json`)**: bloquean en el borde, antes de gastar una ejecución del Worker:
1. cualquier ruta que no sea `/v2/…`, `/auth/…`, `/webhooks/…` o `/health`;
2. métodos distintos de GET, POST, PUT y DELETE;
3. peticiones a `/v2/` sin las cuatro cabeceras de la firma;
4. `/webhooks/apple` desde fuera de la red de Apple (17.0.0.0/8);
5. webhooks con un método distinto de POST;
6. tráfico desde la red Tor.

**Límites (`reglas-limite.json`)**: 20 peticiones por minuto por IP a `/auth/` (10 minutos de bloqueo) y 300 por minuto a toda la API.

A mano en el panel de Cloudflare:
- **SSL/TLS:** modo *Full (strict)*, TLS mínimo 1.2, *Always Use HTTPS*.
- **Reglas administradas** (*Cloudflare Managed Ruleset* y *OWASP Core*): actívalas si tu plan las incluye (Pro o superior).
- **Bot Fight Mode: déjalo apagado para el dominio de la API.** Presenta desafíos pensados para navegadores y una app no puede resolverlos.
- Los límites de un minuto necesitan un plan de pago; el plan gratuito solo admite una regla con ventanas de 10 segundos.

Por eso el Worker tiene sus propias barreras, que no dependen del plan: límite de 20 intentos por minuto por IP en `/auth/` (Redis), cuerpo máximo de 16 KB y la firma HMAC.

## Qué tienes que configurar

**Apple**
- *Certificates, Identifiers & Profiles → Identifiers*: en el App ID activa **Sign in with Apple** y **App Attest**.
- *Keys*: crea una clave con *Sign in with Apple* → `APPLE_SIGNIN_KEY_ID` y el `.p8` (`APPLE_SIGNIN_PRIVATE_KEY`).
- `APPLE_TEAM_ID`: tu Team ID.
- `APPLE_APP_ATTEST_ROOT_CA`: descarga «Apple App Attestation Root CA» desde apple.com/certificateauthority y pega el PEM completo. No lo incluí en el repositorio porque no pude descargarlo desde este entorno y un certificado raíz no se copia de memoria.
- En Xcode, capacidad *App Attest* con el entorno `production`.

**Google**
- *Play Console → Play Games Services*: crea el proyecto de juego y dos credenciales: una de tipo Android (la app) y una de tipo **Aplicación web** → `PLAY_GAMES_CLIENT_ID` y `PLAY_GAMES_CLIENT_SECRET`. El mismo client id va en `PlayGamesSignInService`.
- *Play Console → Integridad de la app*: enlaza un proyecto de Google Cloud y activa la **Play Integrity API**. Su número de proyecto va en `PlayIntegrityService`.
- A la cuenta de servicio (`GOOGLE_CLIENT_EMAIL`) dale acceso a Play Integrity además de la API de pedidos.
- **Avisos de reembolso:** en *Play Console → Configuración de monetización* indica un tema de Pub/Sub; en Google Cloud crea una suscripción **push** a `https://API_HOST/webhooks/google` con autenticación activada. La cuenta de servicio y la audiencia que elijas van en `GOOGLE_PUSH_SERVICE_ACCOUNT` y `GOOGLE_PUSH_AUDIENCE`.

**Apple (reembolsos):** en App Store Connect → *Información de la app → Notificaciones del servidor de App Store*, versión 2, URL `https://API_HOST/webhooks/apple`.

## Qué está probado y qué no

Probado (56 pruebas, con PostgreSQL real):
- los verificadores de Play Integrity, App Attest, Sign in with Apple y Play Games, con certificados, firmas y respuestas fabricados en la prueba: aceptan lo legítimo y rechazan cada trampa (APK modificado, emulador, certificado que no es de Apple, otra app, desafío repetido, clave clonada, token ajeno…);
- el inicio de sesión completo, Device Binding, cambio de teléfono y la regla de 30 días, incluidos dos intentos simultáneos;
- que el Worker empaqueta con todas sus dependencias.

**No probado:** nada de esto ha corrido en un iPhone o un Android real ni contra los servidores de Apple y Google, porque requiere tus credenciales y una compilación firmada. Los adaptadores nativos (`app/src/services/adapters/`) están escritos contra las definiciones de cada plugin pero no se han ejecutado. Las reglas del WAF tampoco se han publicado en una zona real. Lo primero al tener las credenciales es probar un inicio de sesión en cada plataforma.

Para desarrollar: una compilación de depuración no pasa Play Integrity (no viene de Play) ni App Attest de producción. Usa la pista de **pruebas internas** de Play y, en iOS, `APP_ATTEST_ENVIRONMENT = "development"` en un ambiente de pruebas aparte.
