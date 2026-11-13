# 6 · El juego V2 (partiendo de la V1)

La V2 del juego es **la V1 completa** (`v2/juego/`, copia de `index.html`, `tienda.js` y `dialogos.js` de la raíz) con las mejoras encima. No se quitó nada: cuentas, emblemas y su editor, marco dorado, racha con sus billetes y multiplicadores, ruleta diaria, misiones (hoy, semana y logros), los 4 marcadores con emblemas, insignias, fondos animados, barras animadas, colores del juego, edición limitada, grupo VIP, correo, anti-trampas y partidas verificadas.

> La demo anterior (`v2/app/web-mvc-borrador`) reescribía el juego desde cero y perdía funciones de la V1. Quedó descartada; la partida y las vistas nuevas salen de aquí.

## Qué se agregó

| Mejora | Dónde |
|---|---|
| **Jugar** sigue siendo el modo **Clásico** (el ranking principal, sin power-ups de pago), igual que en la V1. Al lado, el botón **⚡ Arcade** (con cuenta) muestra cuántos power-ups tienes | `index.html` (`playArcade`, `runMode`) |
| **Marcador Arcade** como 5ª pestaña; el récord Arcade no toca el Top global, el semanal ni el mensual | `index.html` (`arcade/<uid>`, `fetchTopArcade`) |
| **Power-ups de pago** en la partida Arcade: botones a la derecha, 10 s, máximo 3 por partida, se descuentan al usarlos. Reutilizan los efectos de las burbujas de la V1 (que siguen saliendo gratis en los dos modos) | `v2/controladores.js` (`PowerUpController`), `activatePup` en `index.html` |
| Pestaña **⚡ Power-Ups** en la tienda: packs de oferta animados (dinero real, compra de prueba en la demo) y de a uno con pesos a $500.000 | `v2/vistas.js`, `tienda.js` (`v2`) |
| Pestaña **Sonidos**: 7 sonidos de rebote que se compran con pesos y se equipan (clásico, pato, scanner, máquina expendedora, moneda, gota, láser) | `tienda.js` (`sfx`), `v2/controladores.js` |
| **Música de fondo** (sintetizada, varía en cada vuelta) con su interruptor en Ajustes | `app/src/services/AudioService.js` |
| **Animación de compra** de cada artículo, con el texto según el género («¡La Tía Patita es tuya!», «¡Los Tíos Patitos son tuyos!», «¡El Lingote de oro es tuyo!») | `v2/vistas.js` (`celebrar`) |
| **Personaje secreto**: silueta que se revela de a poco, destello, y después el cuadro VIP de la V1 con tratamiento dorado | `v2/vistas.js`, `v2.css` |
| **Anuncios** cada 5 partidas, solo al salir del resumen; «Sin anuncios» los quita. **Privacidad** (consentimiento) la primera vez, en el menú (nunca encima de una partida) | `AnunciosController` |
| **Cambiar nombre** una vez cada 30 días, con **filtro de groserías** (también al crear la cuenta) | `NombreController`, `changeName` en `index.html`, `shared/profanity.js` |
| **Eliminar cuenta** en Ajustes | `deleteAccount` en `index.html` |
| **Fondos**: los de la V1, con una capa animada propia de cada uno (polvo de oro, nieve, luciérnagas y estrellas fugaces, burbujas iridiscentes, chispas neón, destellos, espiral del agujero negro) | `v2/ambiente.js` |
| **Lingotes y diamante** con halo, brillo y prisma; la billetera brilla cuando llevas uno | `v2.css` |
| **El Pato**: respira en la cancha, salta con «Monedas dobles» y se burla en el resumen | `v2.css`, `index.html` |
| **Botones premium** (Tienda, Marcadores, Misiones, Jugar, Ajustes) e **ícono propio de la tienda** (un puesto con toldo y moneda) en lugar del emoji | `index.html`, `v2.css` |
| Arreglo: el aviso de correo y el del grupo VIP no se leían con los colores oscuros | `v2.css` |

## Cómo está armado

- El juego de la V1 sigue en `index.html`. Se le agregaron **puntos de enganche** marcados con `V2:` en los comentarios y, al final, un **puente** (`V2.attach({...})`) que expone lo justo: la sesión, la billetera, el estado de la partida, leer y escribir en la base, activar un efecto, cambiar el nombre y eliminar la cuenta.
- Lo nuevo vive en `v2/` con el patrón M.V.C:
  - `modelo.js`: solo datos (getters y setters) — cuenta V2, preferencias del teléfono, partida.
  - `controladores.js`: toda la lógica — power-ups, compras, anuncios, nombre, sonido, datos.
  - `vistas.js` y `ambiente.js`: dibujan y avisan de los toques.
  - `main.js`: arma todo y expone `window.V2`, lo que llama el juego.
- `build-demo.mjs` empaqueta `v2/*.js` en `v2.js` (el archivo que se publica junto a `index.html`) y arma la demo de una sola página.

## La demo

`node build-demo.mjs` deja en `dist/` el juego con un **Firebase local** (`demo/firebase-local.js`): intercepta las llamadas a Firebase y guarda todo en el navegador. Así funciona todo sin servidor. Trae rivales de ejemplo en los marcadores. En Ajustes hay «Pesos de prueba» (+$100.000.000) para probar la tienda completa.

## Reglas de Firebase

`node herramientas/generar-reglas.js v2/juego` genera `v2/juego/firebase-rules.json` desde el catálogo de la V2 (las reglas de la raíz no cambian). Agrega:
- el marcador `arcade/` (solo sube y no puede pasar de tu partida terminada, igual que el Top global);
- `v2/<uid>`: los power-ups solo se gastan, o se compran de a uno pagando exactamente $500.000 en la misma escritura; «Sin anuncios» y los packs solo los entrega el servidor; el cambio de nombre, una vez cada 30 días;
- los sonidos de rebote como artículos de la tienda (`own/sfx_*`, `eq/sfx`).

`pruebas/reglas-v2.test.js` lo comprueba (18 casos).

## Pruebas

Las pruebas de la V1 corren sobre el juego V2 (`JUEGO=../v2/juego`):

| Prueba | Resultado sobre la V2 |
|---|---|
| Humo (partida, física, burbujas, tienda, accesibilidad…) | 155 de 155. En otras dos corridas, 154: falló «tras recargar siguen apagados», que también falla con la V1 original en este entorno (1 de cada 6 recargas el navegador de pruebas pierde lo guardado de una página abierta como archivo) |
| Racha diaria | 51 de 51 |
| Marcadores | 51 de 51 (ahora con 5 pestañas) |
| Emblema | 16 de 16 |
| Ruleta | falla en el mismo punto también con la V1 original («con el último giro de ayer, el punto rojo vuelve»): es un problema previo de esa prueba |
| Reglas de la V2 (`reglas-v2.test.js`) | 18 de 18 |

## Pendientes

- **Cambiar nombre y eliminar cuenta** funcionan en la demo, pero con las reglas de Firebase se rechazan (el nombre está atado al registro `names/` y el marcador no deja borrar filas). En el servidor nuevo ya están hechos y probados (`PUT /v2/account/name`, `DELETE /v2/account`); sobre Firebase harían falta funciones de servidor.
- **Cuentas antiguas** (nombre + contraseña, sin correo): para cambiar el nombre primero tienen que asociar un correo, porque entran con su nombre.
- Pasar las partes grandes de `index.html` (partida, tienda, marcadores, racha) a módulos M.V.C, de a una y con las pruebas de la V1 corriendo en cada paso.
- App nativa (Capacitor), compras y anuncios reales, inicio de sesión con Apple y Play Games: ya diseñados en los documentos 03 y 04.
