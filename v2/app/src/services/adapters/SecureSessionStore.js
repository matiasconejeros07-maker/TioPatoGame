// La sesión (id + clave HMAC) se guarda en el Keystore de Android / Keychain de iOS, nunca en localStorage.
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const KEY = 'sesion';
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** @implements {import('../ports.js').SessionStore} */
export class SecureSessionStore {
  async load() {
    const raw = await SecureStorage.getItem(KEY);
    if (!raw) return null;
    const { id, key, userId } = JSON.parse(raw);
    return { id, key: fromBase64(key), userId };
  }
  async save({ id, key, userId }) { await SecureStorage.setItem(KEY, JSON.stringify({ id, key: toBase64(key), userId })); }
  async clear() { await SecureStorage.removeItem(KEY); }
}
