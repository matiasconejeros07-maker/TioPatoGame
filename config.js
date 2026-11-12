// Marcadores compartidos entre todos los jugadores.
// Pega aquí la URL de tu Firebase Realtime Database (ver LEEME.md), por ejemplo:
//   window.DINERO_DB_URL = 'https://mi-proyecto-default-rtdb.firebaseio.com';
// Si queda vacío, el juego funciona igual, pero los puntajes solo se guardan en este dispositivo.
window.DINERO_DB_URL = 'https://juegotiopato-default-rtdb.firebaseio.com';

// Cuentas (nombre + contraseña). Pega aquí la «Clave de API web» de tu proyecto de Firebase
// (Configuración del proyecto ⚙ → General → «Clave de API web»). No es secreta: la protegen las reglas.
// Mientras esté vacía, el juego funciona en modo local: solo pide un nombre y no hay contraseña.
window.FIREBASE_API_KEY = 'AIzaSyDbiWooHuwa40mR0-XBsf7hwc6Mdu0HeMQ';

// Interruptor del arte de los personajes (cada uno tiene su carpeta en tienda.js: pato/, patita/).
// Déjalo con cualquier valor para usar las imágenes; si queda vacío, el juego usa un emoji.
window.PATO_DIR = 'pato/';

// Si algún día cambias de dirección del juego: pon aquí el link nuevo (por ejemplo 'https://mi-juego.pages.dev') y quien entre por cualquier otra dirección será llevado al nuevo.
// Déjalo vacío para que no haga nada.
window.ENLACE_NUEVO = '';
try { if (window.ENLACE_NUEVO && location.origin !== new URL(window.ENLACE_NUEVO).origin) location.replace(window.ENLACE_NUEVO.replace(/\/+$/, '') + '/' + location.search); } catch (e) {}

// Redes sociales: botones con estilo patito en el inicio. Pon el link completo (https://…) de cada una; las que dejes vacías no se muestran.
// (WhatsApp: el link de tu comunidad o grupo, por ejemplo https://chat.whatsapp.com/xxxx)
window.REDES = { instagram: '', tiktok: '', youtube: '', facebook: '', whatsapp: '', x: '' };
