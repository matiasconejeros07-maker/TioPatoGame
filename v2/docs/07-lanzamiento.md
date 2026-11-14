# 7 · Lanzamiento: base de datos nueva, migración y Play Store

Guía paso a paso para pasar de la V1 (Firebase) a la V2 (PostgreSQL + Redis) sin que nadie pierda su cuenta, y publicar
en Google Play. Los precios son aproximados (noviembre de 2026): revísalos en la página de cada servicio antes de pagar.

---

## 1. ¿Los jugadores de la V1 conservan su cuenta?

**Sí.** No hay que empezar de cero y nadie pierde nada:

- Todo lo de Firebase se copia a PostgreSQL: nombre, correo, pesos ganados y gastados, compras, lo equipado, emblema,
  racha y multiplicadores, récord, partidas, logros, ruleta, marcadores semanal y mensual, VIP y marco dorado.
  Además se guarda una copia íntegra de cada cuenta tal como estaba.
- La carga es **todo o nada**: al final compara 10 sumas de control (cuentas, pesos, artículos, rachas, récords…)
  entre Firebase y PostgreSQL. Si una sola no calza, no guarda nada.
- **Cómo lo vive el jugador:** instala la app, entra con Google Play Games, toca **«Ya tenía cuenta»** y escribe su
  nombre (o correo) y contraseña de siempre. En ese momento su cuenta antigua pasa a ser su cuenta nueva, con todo.
- Las contraseñas no se copian (Firebase no las entrega en claro). Firebase queda encendido **solo** para comprobar
  la contraseña cuando alguien reclama su cuenta. Se apaga cuando ya casi nadie reclama (6 a 12 meses).

Está programado y probado con datos de ejemplo (`v2/migracion`, `docs/02-migracion-firebase.md`). Lo que **no** se ha
hecho todavía es correrlo con tu exportación real: ese es el primer ensayo del paso 4.

---

## 2. Dónde estamos (sin adornos)

| Parte | Estado |
|---|---|
| Esquema de la base (PostgreSQL) y marcadores (Redis) | ✅ hecho y probado |
| Migración desde Firebase | ✅ hecha y probada con ejemplo · ⏳ falta ensayo con tus datos reales |
| Servidor: inicio de sesión con Play Games/Apple, 1 dispositivo por cuenta, firma de peticiones, compras con verificación, reembolsos, power-ups, cambiar nombre, eliminar cuenta, reclamar cuenta antigua | ✅ hecho y probado |
| Servidor: terminar partida y guardar puntaje (con antitrampas), billetera, tienda con pesos, equipar, racha, ruleta, misiones/logros, marcadores, emblema/perfil | ✅ hecho y probado (`GameRepository`, `shared/economia.js`, 21 pruebas nuevas) |
| Juego V2 hablando con el servidor nuevo (hoy habla con Firebase) | ❌ **falta** |
| App Android (Capacitor) con Play Games, Google Play Billing, AdMob y Play Integrity | ❌ **falta** (diseñada en los documentos 03 y 04) |
| Cuentas en los servicios (Play Console, Cloudflare, base de datos, Redis, dominio, AdMob) | ❌ falta: las creas tú |

Las filas con ❌ de desarrollo las puedo hacer yo aquí, en la nube, con pruebas automáticas en cada paso. No necesitan tu PC.

---

## 3. Recomendación: lanzar directo sobre la base nueva

Lanzar primero sobre Firebase y migrar después parece más rápido, pero obliga a migrar **con la app ya publicada y
jugadores activos** (dos versiones conviviendo y dos migraciones). Además Firebase no puede verificar compras con dinero
real ni eliminar cuentas sin funciones de servidor, y las dos cosas son obligatorias o necesarias en Play Store.
Recomiendo terminar la conexión a la base nueva y lanzar una sola vez.

---

## 4. Paso a paso

### Paso 0 · Decisiones que no se pueden cambiar después (tú)

1. **Nombre del paquete** (por ejemplo `cl.tuempresa.tiopato`). Hoy el código usa el provisorio
   `com.miempresa.pingpong` (en `v2/shared/ids.js`). Una vez subido a Play Store **no se puede cambiar nunca**.
2. **Dominio** (por ejemplo `tiopato.cl`). La API quedaría en `api.tiopato.cl`.
3. **Cuenta de Play Console personal u organización:**
   - *Personal:* USD 25 y verificación de identidad. Si la cuenta es nueva, Google exige una **prueba cerrada con al
     menos 12 personas durante 14 días seguidos** antes de dejarte publicar.
   - *Organización (empresa):* USD 25, necesita número **D-U-N-S** (gratis, tarda de días a semanas). No tiene
     la regla de los 12 testers y en la tienda sale el nombre de la empresa.

### Paso 1 · Crear las cuentas (tú: requieren tu identidad y tu tarjeta)

| Servicio | Para qué | Dónde |
|---|---|---|
| Google Play Console | publicar la app, compras, reembolsos | play.google.com/console |
| Google Cloud (mismo Google) | cuenta de servicio para verificar compras y Play Integrity; Play Games Services | console.cloud.google.com |
| AdMob | anuncios | admob.google.com |
| Cloudflare | servidor (Workers), dominio, WAF, página de privacidad | dash.cloudflare.com |
| Neon **o** Supabase | PostgreSQL | neon.tech · supabase.com |
| Upstash | Redis (marcadores) | upstash.com |
| Registro del dominio | `.cl` en NIC Chile; `.com` en Cloudflare | nic.cl · Cloudflare Registrar |

Activa la verificación en dos pasos en todas. Las claves **no** me las pegues en el chat: cuando haga falta te pido
cada una con un formulario seguro, o las escribes tú en tu PC.

### Paso 2 · Terminar el desarrollo (yo, aquí en la nube)

1. Servidor: los endpoints que faltan (partida y puntaje, billetera, tienda, equipar, racha, ruleta, misiones,
   marcadores, perfil), con pruebas contra un PostgreSQL real, igual que los que ya existen.
2. Juego: cambiar cada llamada a Firebase por la API nueva, una sección a la vez, corriendo las 155 pruebas del
   juego en cada paso.
3. App Android con Capacitor: inicio de sesión con Play Games, compras con Google Play Billing, anuncios de AdMob cada
   5 partidas, Play Integrity, botón «Eliminar cuenta».
4. Compilación automática del paquete de Play Store (`.aab`) en GitHub Actions, firmado. Así no necesitas Android Studio.

### Paso 3 · Montar la infraestructura (yo, con tu OK en cada paso)

Se hace desde tu PC (o aquí, con las claves guardadas como secretos del entorno):

1. Crear la base en Neon/Supabase y correr las migraciones (`v2/db/migrations/*.sql`).
2. Crear Redis en Upstash.
3. Publicar el servidor en Cloudflare Workers (`wrangler deploy`), con Hyperdrive conectado a la base.
4. Apuntar `api.tudominio` al Worker y activar las reglas de firewall (WAF) y límites por IP del documento 04.
5. Publicar la política de privacidad y la página «Eliminar mi cuenta» en `tudominio/privacidad` y `tudominio/eliminar-cuenta`.
6. Cargar los secretos: cuenta de servicio de Google, ids de Play Games, clave de firma de peticiones, etc.

### Paso 4 · Ensayo de la migración (se puede repetir las veces que quieras)

1. Exportar la base: consola de Firebase → Realtime Database → ⋮ → **Exportar JSON**.
2. Exportar las cuentas (en tu PC): `firebase auth:export usuarios.json --format=json --project juegotiopato`.
3. `node v2/migracion/migrar.js revisar base.json usuarios.json`: no escribe nada, solo muestra las sumas y los datos raros.
4. Cargar en una base **de prueba**, reconstruir los marcadores y reclamar 2 o 3 cuentas reales (la tuya y alguna de
   prueba) desde la app de prueba, para ver que llega todo.

Los archivos exportados tienen correos y datos personales: se guardan solo en tu PC o en la base, nunca en el repositorio.

### Paso 5 · Play Console: preparar la ficha (tú, yo te guío pantalla por pantalla)

1. **Crear app:** nombre, idioma español (Chile), juego, gratis.
2. **Ficha de Play Store:** ícono 512×512, gráfico destacado 1024×500, de 4 a 8 capturas de teléfono, descripción
   corta (80 caracteres) y larga. Yo preparo las capturas y los textos.
3. **Contenido de la app** (todo obligatorio):
   - Política de privacidad (URL del paso 3).
   - **Anuncios: sí.**
   - **Seguridad de los datos:** qué se recolecta (nombre, identificador de cuenta, compras, identificador de
     publicidad, número de WhatsApp de quien lo deja en el cuadro VIP), que va cifrado y que se puede borrar.
   - **Eliminación de cuenta:** dentro de la app **y** con una URL web (las dos cosas las exige Google).
   - **Clasificación de contenido** (cuestionario IARC). Ojo con la ruleta: se paga solo con pesos del juego, sin
     dinero real, y así hay que declararlo.
   - **Público objetivo:** recomiendo **13 años o más**. Si eliges menores de 13, entran las reglas de «Familias»
     (anuncios certificados, sin publicidad personalizada, más revisión).
4. **Productos integrados:** crear los packs de power-ups y «Sin anuncios» con los mismos ids de `v2/shared/ids.js`.
5. **Perfil de pagos:** cuenta bancaria para recibir el dinero. En Chile Google cobra y entrega el IVA de las ventas
   digitales; para tu renta, consulta con tu contador.

### Paso 6 · Pruebas antes de abrir al público

1. **Prueba interna** (hasta 100 personas, sale en minutos): probamos instalar, reclamar cuenta, comprar con
   tarjetas de prueba, anuncios de prueba, eliminar cuenta y reembolsos.
2. **Prueba cerrada:** si tu cuenta es personal y nueva, son 12 testers o más durante 14 días seguidos. Sirven
   amigos o familia con Android, y tienen que tener la app instalada todo ese tiempo.
3. **Solicitar acceso a producción** (lo pide Play Console) y esperar la revisión: de 1 a 7 días, a veces más la primera vez.

### Paso 7 · El día del lanzamiento (el corte de la V1)

1. En la V1: aviso «¡Nos mudamos a la app! Tu cuenta te espera» y cierre de escritura en Firebase (ya nadie gana ni gasta ahí).
2. Exportación final, `revisar`, `cargar` en la base **real** y marcadores.
3. Firebase → Authentication → desactivar **«Habilitar la creación»** (solo queda el inicio de sesión, para reclamar cuentas).
4. Publicar en producción por etapas: 10% → 50% → 100% en 2 o 3 días, mirando errores y reseñas.
5. La web de la V1 pasa a ser el **Modo Práctica** con el botón «Descárgalo en Google Play».

### Paso 8 · Después del lanzamiento

- Copias de seguridad automáticas de la base (Neon y Supabase Pro las traen; conviene una exportación semanal aparte).
- Revisar cada semana Play Console (fallos, ANR, reseñas) y el panel de Cloudflare (errores y bloqueos del firewall).
- Reembolsos: llegan solos por el webhook y descuentan lo comprado.
- A los 6–12 meses: correo a quienes no reclamaron su cuenta (`legacy_email`) y después apagar Firebase.

---

## 5. Costos

### Únicos

| Qué | Costo aprox. |
|---|---|
| Cuenta de Google Play Console | USD 25 (una vez) |
| Dominio `.cl` (NIC Chile) | ~CLP 10.000 al año · `.com`: ~USD 10–12 al año |
| Apple Developer (solo si después quieres iPhone) | USD 99 al año |

### Mensuales

| Servicio | Al lanzar (hasta unos miles de jugadores) | Creciendo (decenas de miles) |
|---|---|---|
| Cloudflare Workers (servidor + WAF básico) | USD 0 (plan gratis: 100.000 peticiones al día) → recomiendo **USD 5** (Workers Paid) para no quedarte corto | USD 5 + uso |
| PostgreSQL | Neon: plan gratis para el ensayo; para producción el plan pagado (~USD 5–20 según uso) · Supabase Pro: USD 25 | USD 20–70 |
| Redis (Upstash) | USD 0 (capa gratis) | ~USD 0,20 por cada 100.000 comandos (pocos dólares al mes) |
| Firebase (solo para reclamar cuentas) | USD 0 (plan Spark) | USD 0 |
| AdMob | gratis: **te paga** a ti | — |
| Página de privacidad (Cloudflare Pages) | USD 0 | USD 0 |
| **Total aproximado** | **USD 5–30 al mes** | USD 30–100 al mes |

### Comisiones sobre lo que vendes

- Google Play se queda con el **15%** de tus ventas del primer millón de dólares al año (hay que inscribirse en ese
  programa en Play Console; si no, es 30%).
- AdMob: tú recibes la mayor parte de lo que pagan los anunciantes (Google se queda con su parte antes de pagarte).

---

## 6. Lista para que no haya problemas

- [ ] Nombre del paquete definitivo **antes** de la primera subida.
- [ ] Guardar la **clave de firma** en dos lugares seguros. Con «Firma de apps de Play» Google guarda la de la tienda,
      pero la de subida es tuya.
- [ ] Ensayo de migración con datos reales, sin datos anómalos sin resolver.
- [ ] Probar en al menos 3 teléfonos Android distintos, incluido uno de gama baja.
- [ ] Compras de prueba, reembolso de prueba y anuncios de prueba (nunca hacer clic en tus propios anuncios reales: AdMob suspende la cuenta).
- [ ] Política de privacidad y página de eliminación de cuenta publicadas y funcionando.
- [ ] Seguridad de los datos y clasificación de contenido llenadas igual a lo que la app hace de verdad.
- [ ] Copias de seguridad de la base activadas antes del corte.
- [ ] Aviso a los jugadores de la V1 con unos días de anticipación.

## 7. Qué puedo hacer en tu PC (siempre con tu OK antes de cada paso)

Exportar las cuentas de Firebase, correr la migración, crear las tablas, publicar el servidor con `wrangler`, cargar
secretos y revisar que todo responda. **No** crearé cuentas a tu nombre ni haré pagos: eso lo haces tú, y yo te guío
pantalla por pantalla. Para darme acceso: app de escritorio de Claude → Configuración → Claude Code → Remote Control →
agregar la carpeta del proyecto.
