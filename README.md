# Gánale al Tío Pato

Juego web instalable (PWA) para celulares: rebota la moneda con tu barra, junta pesos, compra skins, fondos, barras y pelotas, y compite en los marcadores.

- Se juega abriendo `index.html` (no necesita compilar nada). Funciona en cualquier hosting estático.
- Las cuentas, los pesos, las compras y los marcadores viven en Firebase (Realtime Database + Authentication). La configuración está en `config.js`.
- `LEEME.md` explica cómo activar Firebase, la economía, las skins y la protección anti-trampas.
- `firebase-rules.json` son las reglas que hay que pegar en Firebase. Se generan con `node herramientas/generar-reglas.js` a partir de `tienda.js`.

## Publicarlo

**GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.

**Firebase Hosting:** `npm install -g firebase-tools`, luego `firebase login` y `firebase deploy` (ya viene `firebase.json`; el proyecto está en `.firebaserc`, revísalo con `firebase projects:list`).

## Código abierto

- **Código:** licencia [MIT](LICENSE). Puedes usarlo, modificarlo y publicar tu propia versión.
- **Arte:** las imágenes y los logos **no** están bajo MIT; lee [ARTE.md](ARTE.md) antes de reutilizarlos.
- **Colaborar:** lee [CONTRIBUTING.md](CONTRIBUTING.md). Se trabaja con *fork* + *Pull Request* y todo cambio lo revisa quien administra el proyecto.
- **Seguridad:** si encuentras una vulnerabilidad, avisa en privado ([SECURITY.md](SECURITY.md)).
- **Tu propia versión:** `config.js` apunta a la base de datos del juego oficial. Crea tu proyecto de Firebase y reemplaza `config.js` y `.firebaserc` (pasos en `LEEME.md`) para no mezclarte con los jugadores del oficial.
