# Seguridad

## Cómo avisar de una vulnerabilidad

**No la publiques en una issue.** Avisa en privado:

- En GitHub: pestaña **Security → Report a vulnerability** (reporte privado), si está activada.
- Si no aparece, abre una issue **sin detalles técnicos** que diga solo «tengo un reporte de seguridad» y quien administra el proyecto te contactará.

Cuéntanos qué pasa, cómo reproducirlo y qué impacto tiene. Respondemos lo antes posible.

## Qué es público a propósito

- La **clave de API web** y la **URL de la base de datos** de Firebase (`config.js`): no son secretas. Los datos los protegen las **reglas de Firebase** (`firebase-rules.json`), no esconder la clave. Ver `LEEME.md`.
- Los nombres, puntajes y emblemas del marcador son públicos. Las billeteras, partidas, racha, misiones y estadísticas de cada cuenta solo las lee su dueña.

## Qué nos interesa

- Saltarse las reglas de Firebase: leer o escribir datos de otra cuenta, subir pesos, puntaje, tiempo o misiones sin jugar, cobrar dos veces.
- Cruce de sitios (XSS), robo de sesiones o de contraseñas, problemas con el service worker o la política de seguridad de contenido.
- Fugas de datos personales en la carpeta que se publica.

## Qué ya se sabe

Un programa (bot) que juegue de verdad, en tiempo real, puede acumular pesos o misiones a un ritmo acotado: las reglas lo limitan (mínimo de tiempo por rebote, partidas verificadas por el servidor, tope de rebotes por partida), pero no pueden distinguir a una persona de un programa. Está explicado en `LEEME.md` («Anti-trampas»).
