# 2 · Migración de Firebase a PostgreSQL + Redis

Objetivo: que ningún jugador pierda su cuenta, sus pesos, sus compras, su racha ni su progreso.

## Idea central

1. **Los datos se copian por adelantado.** Cada cuenta de Firebase se carga en PostgreSQL como una cuenta «por reclamar» (`status = 'legacy_unclaimed'`), identificada por su `uid` de Firebase.
2. **El jugador la reclama una sola vez.** En la V2 entra con Apple o Play Games (queda con una cuenta nueva y vacía), toca «Ya tenía cuenta» y escribe su nombre o correo y contraseña **de siempre**. La app valida esas credenciales contra Firebase Authentication, que le entrega un ID token; el servidor comprueba ese token y fusiona las dos cuentas.
3. **Las contraseñas no se migran.** Firebase sigue encendido solo para comprobar la contraseña en ese momento. Así también funcionan las cuentas antiguas de «nombre + contraseña», que no tienen correo real.

```
App V2                         Firebase Auth                 API V2 (Worker)                PostgreSQL
  │ entra con Apple / Play Games ─────────────────────────────▶ crea cuenta nueva ─────────▶ users (activa, vacía)
  │ «Ya tenía cuenta»: nombre/correo + contraseña
  │ ──────────────────────────────▶ comprueba la contraseña
  │ ◀────────────────────────────── ID token (firmado por Google)
  │ POST /v2/account/link-legacy { firebaseIdToken } ─────────▶ verifica firma, proyecto,
  │                                                             vigencia y contraseña reciente
  │                                                             una transacción: ─────────▶ la cuenta antigua hereda identidad,
  │ ◀───────────────────────────────────────────────────────── { userId }                   dispositivo y sesión; la vacía se borra
```

Después del enlace, la cuenta antigua **es** la cuenta: mismo saldo, compras, racha y récord, ahora con SSO y atada al dispositivo. La misma sesión sigue sirviendo.

Todo lo jugado en la V1 va al marcador **clásico**: la V1 no tenía power-ups de pago. El marcador arcade parte vacío.

Protecciones del enlace (todas con prueba en `server/test/api.test.js`):
- una cuenta antigua se enlaza una sola vez; un segundo intento de otra persona recibe `cuenta_antigua_ya_enlazada`;
- el ID token tiene que ser de este proyecto, estar vigente y venir de una contraseña escrita hace menos de 10 minutos (no sirve una sesión vieja robada);
- repetir el enlace por un corte de red no rompe ni duplica nada;
- si el jugador ya compró power-ups con la cuenta nueva antes de enlazar, se los lleva.

## Qué se copia

| Firebase (V1) | PostgreSQL (V2) |
|---|---|
| Authentication: `uid`, correo, nombre | `users.firebase_uid`, `legacy_email`, `display_name` |
| `scores/<uid>`: `n`, `k`, `s`, `t`, `ms`, `a` | `users.display_name`, `users.name_key`, `scores.best` y `best_at` (marcador **clásico**), `users.played_ms`, `users.avatar` |
| `wallets/<uid>`: `c`, `sp`, `lr`, `av` | `wallets.earned`, `spent`, `last_run_legacy`, `users.avatar` |
| `wallets/<uid>/own`, `eq` | `inventory`, `equipped` |
| `streaks/<uid>`: `n`, `t`, `x2`-`x4`, `y2`-`y4`, `bx`, `bm`, `bd` | `streaks` (días, último cobro, multiplicadores guardados y el activo) |
| `stats/<uid>` | `stats` (`games`, `bounces` y los contadores de día/semana/mes) |
| `missions/<uid>` | `achievements` |
| `ruleta/<uid>` | `wheel` |
| `weekly/…`, `monthly/…` | `period_scores` (marcador **clásico**) |
| `roles`, `marco`, `compradores`, `vip` | `users.role`, `users.golden_frame`, fecha en `inventory`, `vip_contacts` |
| **todo lo anterior, tal cual** | `legacy_snapshots.data` (copia íntegra por cuenta, por si hay que revisar algo) |

No se copian porque se recalculan: `hist` (contador de puestos; ahora lo hace Redis) y `names`/`mynames` (el nombre único queda en `users.name_key`).

## Procedimiento

**Antes (ensayo, se puede repetir cuantas veces quieras):**

1. Exporta la base: consola de Firebase → Realtime Database → ⋮ → *Exportar JSON* → `base.json`.
2. Exporta las cuentas:
   ```bash
   firebase auth:export usuarios.json --format=json --project juegotiopato
   ```
3. Crea la base y el esquema:
   ```bash
   for f in v2/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
4. Revisa sin escribir nada (muestra las sumas de control y los datos anómalos):
   ```bash
   node v2/migracion/migrar.js revisar base.json usuarios.json
   ```
5. Carga:
   ```bash
   DATABASE_URL=postgres://… node v2/migracion/migrar.js cargar base.json usuarios.json
   ```
6. Reconstruye los marcadores en Redis:
   ```bash
   DATABASE_URL=postgres://… node v2/migracion/migrar.js marcadores | redis-cli -u "$REDIS_URL"
   ```

**El día del corte:**

1. Publica en la V1 un aviso de mantenimiento y **cierra la escritura** en Firebase (reglas: `".write": false`). Desde ese momento nadie gana ni gasta en la V1.
2. Vuelve a exportar y repite los pasos 4 a 6. La carga es repetible: actualiza las cuentas que siguen «por reclamar» y **no toca** las que ya se enlazaron en la V2.
3. En Firebase → Authentication → Configuración → *Acciones del usuario*, desactiva **«Habilitar la creación (registro)»**: ya nadie puede crear cuentas con formulario. El inicio de sesión queda encendido solo para reclamar cuentas.
4. Publica la V2 en las tiendas.

**Después:** cuando ya casi nadie reclame (por ejemplo, 6 a 12 meses), se apaga Firebase. `users.legacy_email` permite avisar por correo a quienes falten.

## Garantías de la carga

- **Todo o nada.** La carga es una sola transacción. Al final compara diez sumas de control (cuentas, pesos ganados, pesos gastados, artículos, días de racha, multiplicadores guardados, récords, tiempo jugado, partidas y logros) entre Firebase y PostgreSQL; si una sola no calza, no se guarda nada.
- **No inventa ni arregla datos.** Si una cuenta trae algo imposible (gastado mayor que ganado, dos cuentas con el mismo nombre), el script se detiene y las lista para que decidas.
- **Las partidas a medio cobrar** de la V1 no se pierden si se cierra la escritura antes de exportar: la V1 las cobra sola al volver la conexión, y lo que no alcance a cobrarse es, como mucho, la última partida de alguien que estaba sin internet.

## Probado

`migracion/test/` carga una exportación de ejemplo (cuenta antigua sin correo, cuenta con correo, cuenta sin jugar) en un PostgreSQL real, repite la carga y comprueba que no se duplica nada ni se pisa una cuenta ya enlazada. También se ejecutó el flujo completo por línea de comandos, incluida la carga de los marcadores en un Redis real. **No se ha probado con tu exportación real de Firebase**: el paso 4 («revisar») es el primer lugar donde aparecería cualquier dato que el ejemplo no contempla.
