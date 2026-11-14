# 8 · Auditoría antes del lanzamiento: escala, base de datos y seguridad

Revisión de punta a punta del juego V2 conectado al servidor nuevo, pensando en **más de 10.000 personas jugando a la vez**.
Cada problema encontrado se corrigió y quedó con su prueba. Lo que depende de configurar servicios está en la sección 4.

---

## 1. Resultado de la prueba de carga

`server/testing/carga.mjs`: jugadores simulados contra la API completa y un PostgreSQL real. Cada uno abre el juego, cobra la
racha, gira la ruleta, juega partidas (empezar → cobrar → tiempo), mira el marcador, compra y cobra misiones, con pausas.

| Jugadores simultáneos | Peticiones por segundo | Transacciones en PostgreSQL | Errores | Bloqueos mutuos | Partidas cobradas | Saldos negativos |
|---|---|---|---|---|---|---|
| 300 | 299 | 275/s | 0 (solo rechazos esperados*) | 0 | 2.792 de 2.792 | 0 |
| 3.000 | 1.300 | 1.210/s | 0 (solo rechazos esperados*) | 0 | 16.885 de 16.885 | 0 |

\* «ya lo compraste», «esa misión aún no se cumple»: respuestas correctas a pedidos que no corresponden.

Con 1.210 transacciones por segundo, **PostgreSQL estuvo ocupado en promedio 1,2 conexiones a la vez, ~1 ms por transacción**.

**Cálculo para 10.000 personas jugando a la vez.** Una partida cada ~75 s y ~6 peticiones por partida dan unas **800 peticiones por
segundo**: menos de lo que la prueba sostuvo sin errores. La base tiene margen de sobra. Una base de producción pequeña
(Neon/Supabase, 1 a 2 vCPU) es más lenta que el computador de la prueba, pero aun 4 veces más lenta daría unas 5 conexiones ocupadas.

El servidor (Cloudflare Workers) no es el límite: Cloudflare lo reparte en tantas copias como haga falta.

## 2. Problemas encontrados y corregidos

| # | Problema | Riesgo con 10.000 jugadores | Corrección |
|---|---|---|---|
| 1 | Las rutas del juego **no tenían límite por jugador** (solo el inicio de sesión) | Una sola app modificada pidiendo su estado miles de veces por segundo saturaba la base para todos | Límite de 120 peticiones por minuto por sesión, aplicado por Cloudflare en el borde (sin costo por uso ni paso por Redis). Probado: el que abusa recibe 429 y los demás siguen jugando |
| 2 | **Cada petición gastaba un comando de Redis** (el nonce antirrepetición) | Decenas de millones de comandos al día: con Upstash «por uso», más de USD 100 al día | El nonce se exige solo en lo que cambia algo (las lecturas repetidas no hacen daño). Se recomienda el plan fijo de Upstash (ver guía) |
| 3 | **Cada petición consultaba la base para validar la sesión** | Una consulta extra por cada acción de cada jugador | Las sesiones se recuerdan 60 s en la memoria del Worker. Al eliminar la cuenta se olvidan al tiro |
| 4 | El estado de la cuenta costaba **~12 consultas** y el juego lo pide al abrir y tras cada acción | La operación más frecuente era la más cara | Ahora es **1 consulta**, y además trae los mejores de la semana y del mes (antes eran consultas aparte) |
| 5 | El adaptador recargaba el estado **también cuando nada visible cambiaba** (al empezar partida y al informar el tiempo) | Un tercio de consultas de sobra | Solo recarga cuando cambian pesos, objetos o premios |
| 6 | Los marcadores públicos y el contador de puestos se calculaban **en cada visita** | Miles de personas mirando el marcador = miles de consultas que recorren la tabla de récords | Caché de 30 s en el borde de Cloudflare: ~1 consulta cada 30 s por centro de datos |
| 7 | **Nada borraba datos viejos** | ~500.000 partidas por día: la base crece gigas al mes (y se cobra por almacenamiento) | Limpieza diaria automática (cron): partidas terminadas de más de 7 días, sesiones vencidas y marcadores de períodos viejos. Se conservan pesos, récords, estadísticas y las partidas marcadas como sospechosas |
| 8 | Una consulta lenta podía quedar colgada | Si la base se pone lenta, se amontonan conexiones y cae todo | `statement_timeout` de 5 s: se corta en vez de amontonar |
| 9 | El cuerpo de la petición solo se medía por su encabezado | Un cuerpo gigante «sin declarar» llegaba a leerse entero | Se mide el cuerpo leído: más de 16 KB = 413 |
| 10 | Límite de inicio de sesión de **20 por minuto por IP** | En Chile, las compañías móviles ponen a miles de celulares detrás de la misma IP (CGNAT): el día del lanzamiento se bloquearía gente real | 60 por minuto por IP. La verificación del teléfono (Play Integrity) y el WAF frenan los ataques antes |
| 11 | CORS aceptaba `http://localhost` | Innecesario en producción | Solo la app (`https://localhost`, `capacitor://localhost`) y el dominio de la web |
| 12 | Trampa por app modificada: se pueden informar rebotes al ritmo máximo físico | Un tramposo cobra lo máximo posible por minuto | Ya era imposible pasar del máximo físico. Ahora las partidas a más del 90 % de ese ritmo quedan **marcadas para revisión** (no se bloquean solas, para no castigar a un jugador muy bueno) y no se borran en la limpieza |
| 13 | Partidas Arcade sumaban a misiones y marcadores semanal/mensual | Diferente de lo que hace el juego (solo el modo clásico cuenta) | Igual que el juego |
| 14 | El empaquetado de la demo podía **duplicar partes de la página** (el texto insertado con «$'» se interpretaba) | Página rota o pesada | Reemplazos literales |
| 15 | La V2 no tenía su `sw.js` (caché sin conexión): error 404 al abrir | Sin modo sin conexión | `juego/sw.js` con los archivos de la V2 |

Además, lo que ya estaba bien y se verificó en esta revisión:

- **El servidor calcula todo**: pesos, premios, misiones y precios. El juego solo dice qué pasó. Un cliente modificado no puede regalarse
  pesos, ni cobrar dos veces (probado con 3 cobros simultáneos de la misma partida), ni cambiar la pelota a mitad de partida.
- Todo lo que mueve dinero va en una transacción con la cartera bloqueada: **0 saldos negativos** con miles de jugadores a la vez.
- **Sin inyección SQL**: todas las consultas usan parámetros, y los nombres de columna variables salen de listas fijas.
- **Sin inyección de HTML**: los nombres de otros jugadores se muestran como texto, nunca como HTML.
- **Las peticiones van firmadas** (HMAC con una clave por sesión). La clave se entrega una vez por TLS y se guarda en el Keystore/Keychain.
- **Inicio de sesión**: desafío de un solo uso, verificación del teléfono y la app (Play Integrity / App Attest: sin emuladores, root
  ni APK modificado) y cuenta de Google Play Games / Apple. Un teléfono = una cuenta.
- **Errores**: el cliente solo recibe un código, nunca detalles internos.
- **Sin secretos en el repositorio.** La clave web de Firebase de la V1 (`config.js`) es pública por diseño de Firebase; su seguridad son las reglas.

Pruebas: servidor 54 de 54 · juego en modo API, de punta a punta con navegador real, 25 de 25 · juego en modo Firebase, 154 de 155
(la que falla es intermitente y también falla con la versión anterior a estos cambios).

## 3. ¿Pueden robar o modificar el código una vez publicado?

Sin vueltas: **todo lo que se instala en un teléfono se puede extraer**. Un APK o una app de iOS se puede desarmar, y el juego es
HTML/JavaScript. Ninguna herramienta lo impide al 100 %. Por eso la protección real no es esconder el código: es que **el código del
teléfono no tenga nada que valga la pena robar ni nada que permita hacer trampa**. Así está construido:

1. **Ningún secreto en la app.** Las claves privadas (Google, Apple, la clave maestra de sesiones, la base de datos) viven solo en el
   servidor, como secretos de Cloudflare. Si alguien desarma la app, no encuentra nada que le abra la base.
2. **El servidor decide todo.** Aunque alguien modifique el juego, el servidor recalcula y rechaza lo imposible.
3. **Solo apps originales en teléfonos de verdad pueden iniciar sesión.** Play Integrity (Android) y App Attest (iOS) comprueban que
   la app es la que tú publicaste, sin modificar, en un teléfono sin root ni jailbreak. Una copia modificada no obtiene sesión.
4. **Una cuenta por teléfono** y firma de cada petición: robar la clave de sesión de otra persona exige su teléfono.

Encima de eso, para que copiar o modificar cueste mucho trabajo:

| Medida | Qué hace | Cómo se implementa |
|---|---|---|
| **Protección automática de Google Play** | Google agrega controles contra modificación a tu app, y las copias alteradas dejan de funcionar | Play Console → Protección de la integridad de la app → Protección automática (gratis, se activa con un botón) |
| **Ofuscar el JavaScript** del juego en la compilación de la tienda | El código queda ilegible y difícil de modificar | Paso `javascript-obfuscator` en la compilación de la app (solo para las tiendas; el repositorio queda legible) |
| **R8/ProGuard** (Android) y compilación Release (iOS) | Achica y ofusca la parte nativa | Activado en la compilación de la app |
| **Sin mapas de código** (source maps) en lo publicado | No se entrega el código original junto con la app | Ya se compila así |
| **Firma de la app con Play App Signing** | Google guarda la clave de firma; tu clave de subida se puede cambiar si se pierde | Play Console, al crear la app |

### El repositorio y las cuentas (por donde suelen entrar de verdad)

- **Repositorio de GitHub privado**, con verificación en dos pasos para todos los que tengan acceso.
- Protección de la rama principal: nada entra sin revisión ni con las pruebas fallando.
- **Escaneo de secretos y Dependabot** activados (avisa si alguien sube una clave o si una librería tiene un problema de seguridad).
- **Verificación en dos pasos** en Google (Play Console, Cloud, AdMob, Firebase), Apple, Cloudflare, Neon/Supabase, Upstash y el registro del dominio.
  Una cuenta robada vale más que todo el código.
- La **clave de subida** de Android y los `.p8` de Apple, en un gestor de contraseñas, nunca en el repositorio ni en el chat.

### El servidor y la base

- **WAF de Cloudflare** con las reglas administradas, «Bot Fight Mode», y limitar `/auth` y `/v2` a peticiones con el formato de la app.
- La base acepta conexiones **solo desde Hyperdrive** (lista de IPs permitidas en Neon/Supabase). Nadie más puede conectarse aunque tenga la contraseña.
- **Dos usuarios de base de datos**: uno para la app (solo leer y escribir datos) y otro para las migraciones (crear tablas). Si alguien compromete
  la app, no puede borrar tablas.
- **Copias de seguridad** automáticas con recuperación a un momento exacto (Neon/Supabase Pro) y una exportación semanal aparte.
- **Restringir la clave web de Firebase** de la V1 en Google Cloud (solo Identity Toolkit y Token Service, y solo desde tu dominio) mientras
  Firebase siga encendido para reclamar cuentas.
- **Alertas**: errores 5xx, picos de 429 y partidas sospechosas (consulta `SELECT … FROM matches WHERE suspicious`) revisadas cada semana.

## 4. Pendiente de configurar al publicar (no es código)

- Crear el limitador de Cloudflare (`[[ratelimits]]` en `wrangler.toml`) y el cron de limpieza: se activan solos con `wrangler deploy`.
- Plan fijo de Upstash en vez de «por uso».
- Lista de IPs permitidas en la base, los dos usuarios de base de datos y las copias de seguridad.
- Protección automática de Play y la ofuscación en la compilación de la app (con la app Android).
