// Solo para reclamar cuentas de la V1: comprueba el nombre (o correo) y la contraseña de siempre contra
// Firebase Authentication y devuelve el ID token que el servidor verifica. No crea cuentas.
import { nameKey } from '../../../../shared/names.js';

const INTERNAL_MAIL = '@tio-pato.invalid';     // correo interno de las cuentas «nombre + contraseña» de la V1

/** @implements {import('../ports.js').LegacyAuthService} */
export class FirebaseLegacyAuthService {
  /** @param {{ apiKey: string, fetch?: typeof fetch }} config  la «Clave de API web» de la V1 (config.js) */
  constructor({ apiKey, fetch: fetchFn = (...a) => fetch(...a) }) { this.apiKey = apiKey; this.fetch = fetchFn; }

  async signIn(login, password) {
    const email = login.includes('@') ? login.trim() : nameKey(login) + INTERNAL_MAIL;
    const response = await this.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    if (!response.ok) throw new Error('credenciales incorrectas');
    return (await response.json()).idToken;
  }
}
