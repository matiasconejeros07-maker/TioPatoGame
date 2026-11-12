# Cómo colaborar

¡Gracias por querer ayudar con **Gánale al Tío Pato**! Este es un proyecto abierto (código bajo licencia MIT, ver `LICENSE`; el arte no, ver `ARTE.md`). Quien administra el proyecto revisa y acepta todos los cambios.

## Flujo de trabajo

1. Haz un **fork** del repositorio (o, si te dieron permiso de colaborador, crea una rama).
2. Trabaja en una **rama** (`git checkout -b mi-cambio`). Nunca directamente en `main`.
3. Abre un **Pull Request** contra `main` explicando qué cambia y por qué. Cada PR corre las pruebas automáticas (`pruebas`): deben pasar.
4. Quien administra revisa y, si todo está bien, lo acepta. Todo lo que entra a `main` se publica solo en el juego en línea.

## Probar el juego en tu computador

- El juego es un `index.html` que se abre en el navegador (no hay que compilar nada). Con una carpeta servida (por ejemplo `npx serve .`) se ve igual que en línea.
- **Ojo con `config.js`:** apunta a la base de datos **del juego oficial**. Para probar sin tocarla, en tu copia deja `window.DINERO_DB_URL = ''` y `window.FIREBASE_API_KEY = ''` (modo local: solo un nombre, sin cuentas) o pon **tu propio** proyecto de Firebase (`LEEME.md` explica cómo crearlo). **No incluyas ese cambio de `config.js` en tu PR.**
- Las pruebas usan un Firebase de mentira: no necesitas ninguna cuenta ni clave.

```bash
cd pruebas
npm install
npx playwright install chromium
npm test            # todo (tarda varios minutos)
node reglas.test.js # solo las reglas de Firebase (rápido)
```

## Cosas que tienes que saber antes de tocar algo

- **Reglas de Firebase:** `firebase-rules.json` **se genera** con `node herramientas/generar-reglas.js` a partir de `tienda.js`. Si cambias la economía, las misiones, la tienda o lo que valida el servidor, corre el generador y sube el archivo regenerado (el CI comprueba que coincida). Las reglas las publica a mano quien administra el proyecto en la consola de Firebase: un colaborador no puede.
- **Anti-trampas:** los pesos, las misiones, la racha y el tiempo jugado los verifica el servidor (reglas de Firebase), nunca el celular. No muevas esa lógica al cliente.
- **Economía y dificultad** (precios, premios, velocidad de la pelota, tamaño de la barra) afectan a todos los jugadores: abre primero una *issue* y explica el cambio. Hay simulaciones y pruebas que los vigilan.
- **Seguridad y privacidad:** el juego maneja contraseñas y correos. Cambios en el inicio de sesión, en la política de seguridad de contenido (`<meta http-equiv="Content-Security-Policy">`), en `sw.js` o en cualquier script externo necesitan revisión cuidadosa. No agregues librerías externas ni scripts de terceros. La carpeta que se publica (`dist/`) no debe llevar datos personales (una prueba lo vigila).
- **Estilo:** los comentarios y los textos del juego están en español (de Chile); sigue el estilo del código que lo rodea. Sin dependencias nuevas.
- **Pruebas:** si arreglas un error, agrega una prueba que falle sin tu arreglo.

## Ideas y errores

Abre una *issue* contándolo (en español o inglés). Si es un problema de **seguridad**, no lo publiques: lee `SECURITY.md`.

## Trato

Sé amable y respetuoso. Las críticas son al código, no a las personas.
