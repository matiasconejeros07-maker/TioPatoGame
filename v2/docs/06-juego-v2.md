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
| **Fondos rediseñados** (escenas pintadas y animadas en canvas, 30 cuadros/s, quietas en «modo liviano»): Atardecer (sol con rayos, nubes iluminadas, islas, reflejo en el mar, gaviotas), Cristal helado (cueva de hielo, haces de luz, cristales facetados, nieve en capas), Aurora boreal (cortinas con reflejo en el lago, montañas nevadas, pinos, estrellas fugaces), Galaxia (espiral de 1.500 estrellas que gira, nebulosas), Holográfica (lámina iridiscente, panal con onda de luz, prismas flotando), Bóveda de oro (puerta con volante girando, montaña de lingotes, monedas cayendo) y Palacio de diamante (brillante 3D girando con reflejos, rayos de arcoíris, columnas). **Synthwave y Agujero negro quedan como estaban**, con su capa de partículas | `v2/escenas.js`, `v2/fondos.js`, `v2/ambiente.js` |
| **Barras rediseñadas**, cada una con identidad propia (cuerpo en CSS + efectos en el canvas del juego y en la tienda): **Llamarada** (roca volcánica con grietas de lava; lenguas de fuego en tres capas que se avivan al rebotar, humo, brasas con estela), **Tormenta eléctrica** (cápsula con electrodos de cobre y filamento de plasma; rayos ramificados con destello, arco entre electrodos, chispas con gravedad, orbes), **Núcleo radiactivo** (nueva, VIP $8.000.000: cilindro verde con tapas de peligro y burbujas; halo que late como contador Geiger, partículas, símbolo ☢, gotas tóxicas, onda al rebotar), Oro líquido (gotas que se derriten), Cristal (esquirlas de hielo y vaho), Neón (tubo de letrero con casquillos y electrones), Galaxia (polvo de estrellas en órbita y cometa), Arcoíris (cintas de seda), Holográfica (proyector con cubo 3D), Rey Midas (monedas acuñadas con corona grabada) y Diamante (destellos y haces de dispersión) | `v2/barras.js`, `v2.css`, `padFx` en el puente |
| **Lingotes y diamante** con halo, brillo y prisma; la billetera brilla cuando llevas uno | `v2.css` |
| **El Pato**: respira en la cancha, salta con «Monedas dobles» y se burla en el resumen | `v2.css`, `index.html` |
| **Botones premium** (Tienda, Marcadores, Misiones, Jugar, Ajustes) e **ícono propio de la tienda** (un puesto con toldo y moneda) en lugar del emoji | `index.html`, `v2.css` |
| Arreglo: el aviso de correo y el del grupo VIP no se leían con los colores oscuros | `v2.css` |

## Rendimiento (fluidez del juego)

Medido con Playwright simulando un teléfono (CPU 4 veces más lenta), jugando cada combinación de fondo y barra:

| | Antes | Ahora |
|---|---|---|
| Aurora boreal | 7 cuadros/s, el juego al 24% de su velocidad | 60 cuadros/s, velocidad normal |
| Holográfica | 9 cuadros/s, 29% | 60, normal |
| Palacio de diamante | 12 cuadros/s, 40% | 60, normal |
| Atardecer | 14 cuadros/s, 46% | 60, normal (con Llamarada: 56) |
| Cristal / Galaxia | ~19 cuadros/s, ~66% | 60, normal |
| Llamarada (barra) | 44 cuadros/s | 53–58 |

Qué se hizo:

- **El juego ya no va en cámara lenta.** El paso de tiempo tenía un tope de 0,034 s: bajo ~30 cuadros por segundo todo se frenaba. Ahora sigue al reloj real (la física ya se parte en pasos de ≤10 px, así que la pelota no atraviesa la barra) — `loop()` en `index.html`.
- **Los fondos se dibujan en otro hilo** (`v2/fondos-worker.js`, OffscreenCanvas): el juego tiene el hilo principal para él solo. `v2/fondos.js` decide; si el teléfono no puede (o el worker falla), dibuja en el hilo principal mirando el ritmo real de la pantalla.
- **Calidad automática** (`v2/pintor.js`): si un cuadro del fondo se pasa del presupuesto baja resolución y cuadros por segundo (6 escalones; en el worker nunca baja del 60% / 20 cuadros/s), y sube de nuevo cuando sobra tiempo. Las barras tienen lo mismo (`calidad()` en `v2/barras.js`): menos partículas si el teléfono no da abasto.
- **Escenas más livianas** (`v2/escenas.js`): las partes fijas van en capas pintadas una vez (cielos, mar, rayos del sol), las luces difusas (aurora, lámina holográfica, haces de luz) en búferes de ¼ a ⅛ de resolución, las 1.500 estrellas de la galaxia en 16 lotes, y las caras del diamante con colores reusados y un solo trazo. Cada escena bajó de 2–13 ms a 2–3 ms por cuadro.
- **Barras**: llamas prearmadas en 7 curvaturas (antes 45 degradados nuevos por cuadro y una transformación inclinada, que obligaba a un muestreo lento), monedas de Rey Midas prearmadas, halos achatados en vez de cuadrados gigantes y sin animaciones de `filter`/`box-shadow` en la barra de la partida. Arreglada una fuga: Neón y Arcoíris creaban un halo nuevo por cuadro.
- **Synthwave y Agujero negro** (sin cambiar su aspecto): sus partículas usaban `shadowBlur` (desenfoque en tiempo real por partícula); ahora un brillo prearmado.
- Nada mide la página en cada cuadro (antes se llamaba a `getBoundingClientRect` 30 veces por segundo): el tamaño y la visibilidad llegan por ResizeObserver e IntersectionObserver.
- Sigue la red de seguridad de la V1: si aun así el teléfono no da abasto, el «modo liviano» deja los fondos quietos.

## Cómo está armado

- El juego de la V1 sigue en `index.html`. Se le agregaron **puntos de enganche** marcados con `V2:` en los comentarios y, al final, un **puente** (`V2.attach({...})`) que expone lo justo: la sesión, la billetera, el estado de la partida, leer y escribir en la base, activar un efecto, cambiar el nombre y eliminar la cuenta.
- Lo nuevo vive en `v2/` con el patrón M.V.C:
  - `modelo.js`: solo datos (getters y setters) — cuenta V2, preferencias del teléfono, partida.
  - `controladores.js`: toda la lógica — power-ups, compras, anuncios, nombre, sonido, datos.
  - `vistas.js`, `ambiente.js`, `escenas.js`, `fondos.js`, `pintor.js`, `fondos-worker.js` y `barras.js`: dibujan y avisan de los toques.
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
