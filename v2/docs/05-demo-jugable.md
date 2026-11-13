# 5 · Demo jugable

La demo es el juego V2 completo corriendo en un navegador, con los servicios externos **simulados**. Sirve para jugar y revisar pantallas, animaciones y reglas; no es la app final de las tiendas.

## Cómo abrirla

```bash
cd v2/app
node build.mjs
python3 -m http.server 8080 --directory dist
```

Luego abre `http://localhost:8080`. Con `#practica` al final de la dirección se abre el Modo Práctica (lo que verá quien entre por la web).

## Qué es real y qué es simulado

| Parte | En la demo |
|---|---|
| Partida (física, dificultad, pago por rebote, burbujas, enojo del personaje) | **Real.** Mismas constantes y fórmulas de la V1, en `MatchController` |
| Reglas de power-ups, precios, nombres, filtro de groserías, anuncio cada 5 partidas | **Reales** (el mismo código compartido que usa el servidor) |
| Vistas, animaciones, música y sonidos | **Reales** |
| Servidor | Simulado en el navegador (`DemoApi`): guarda todo en ese dispositivo |
| Inicio de sesión, atestación, Device Binding | No hay: entra con una cuenta local |
| Compras con dinero real | Simuladas: aparece «Compra de prueba» y no se cobra |
| Anuncios | Un cartel «Anuncio de prueba» en lugar de AdMob |
| Marcadores | Rivales de ejemplo, más tu puntaje |

En Ajustes hay un botón **«Pesos de prueba»** que suma $100.000.000 para probar toda la tienda, incluido el personaje secreto. Solo existe en la demo.

## Lo que incluye

- **Partida** en dos modos: Clásico (ranking principal, sin power-ups de pago) y Arcade (hasta 3 power-ups de 10 s).
- **Tienda** nueva: pestaña Power-Ups con packs de oferta animados y emblema propio, compra de power-ups con pesos ($500.000), «Sin anuncios», personajes, pelotas, barras, fondos y sonidos de rebote.
- **Marcadores** nuevos: podio de los 3 primeros y lista, por modo.
- **Puntos rojos** en Racha, Logros y Objetivos cuando hay algo por cobrar.
- **Audio** (Web Audio, todo sintetizado): música de fondo de 16 compases en 4 secciones que varía en cada vuelta, y 7 sonidos de rebote equipables (clásico, pato «cuac», scanner «bip», máquina «cash», moneda «kling», gota y láser), normalizados a un volumen bajo y con un limitador al final de la mezcla.
- **Animaciones:** el personaje respira, golpea, tiembla al enojarse, salta en «Monedas dobles» y se burla cuando pierdes; compra de personajes (caen y rebotan), de pelotas (giran), de barras; lluvia de monedas; revelado lento del personaje secreto con su cuadro VIP.
- **Lingotes y diamante:** halo, destello y brillo propios. Los dibujos son los de la V1 con ese tratamiento encima; redibujarlos necesita arte nuevo.
- **Ajustes:** cambiar nombre (30 días, filtro de groserías), sonido, música, restaurar compras, eliminar cuenta.

## Pendientes

- **Servidor del paso 3:** las rutas que hoy responde `DemoApi` (`/me`, `/shop/*`, `/rewards/*`, `/leaderboards`, `/matches/:id/finish`) faltan en el Worker real. `DemoApi` es su especificación.
- **App nativa:** crear los proyectos de Capacitor (iOS y Android), conectar los adaptadores reales y probar en teléfonos con tus credenciales.
- **De la V1 que aún no está en la V2:** ruleta diaria, misiones semanales, emblema de perfil, colores del juego, fondos y barras «para millonarios», efectos de partículas de cada barra, las escenas animadas completas de los fondos, edición limitada Teletón, multiplicadores de la racha (×2, ×3, ×4), marcadores semanal, mensual y de tiempo jugado, y el repertorio completo de frases de `dialogos.js`.
- **Arte nuevo** para lingotes y diamante, si quieres dibujos distintos y no solo el brillo.
