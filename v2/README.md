# Gánale al Tío Pato · V2

La V2 vive en esta carpeta mientras se construye. **La V1 (la raíz del repositorio) sigue funcionando y publicándose igual** hasta el día del corte; nada de aquí la toca.

| Documento | Qué explica |
|---|---|
| [docs/01-estructura.md](docs/01-estructura.md) | Carpetas, patrón M.V.C, a dónde va cada parte de la V1 y los pasos que faltan |
| [docs/02-migracion-firebase.md](docs/02-migracion-firebase.md) | Cómo pasar cuentas, saldos, rachas y progreso de Firebase a PostgreSQL + Redis sin perder nada |
| [docs/03-iap-ads.md](docs/03-iap-ads.md) | Compras, reembolsos, power-ups, anuncios, consentimiento, cambio de nombre y «Eliminar cuenta» |
| [docs/05-demo-jugable.md](docs/05-demo-jugable.md) | Cómo abrir la demo jugable, qué es real, qué es simulado y qué falta |
| [docs/04-seguridad.md](docs/04-seguridad.md) | Inicio de sesión con Apple y Play Games, atestación, Device Binding, firma HMAC y WAF |

## Probar

```bash
cd v2
npm install
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

Sin `TEST_DATABASE_URL` se saltan las pruebas que necesitan PostgreSQL (las de la API y las de carga de la migración).
