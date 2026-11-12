/** Device Binding: la cuenta se puede pasar a un teléfono nuevo una vez cada 30 días. */
export const DEVICE_CHANGE_DAYS = 30;
/** Cuánto dura una sesión antes de tener que iniciar sesión (y atestar) otra vez. */
export const SESSION_DAYS = 30;

/**
 * Android: el nonce que la app le pasa a Play Integrity. Ata el veredicto de Google a ESTE intento de inicio de
 * sesión y a ESTE teléfono, así un veredicto robado de otro teléfono no sirve. base64url(SHA-256("desafío.idDelTeléfono")).
 */
export async function androidNonce(challenge, deviceId) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}.${deviceId}`)));
  return btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
