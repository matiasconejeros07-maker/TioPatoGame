// Cliente de la API. Firma cada petición con la clave de la sesión:
//   X-Signature = HMAC-SHA256(Body + Timestamp + Nonce, clave)  ·  X-Timestamp  ·  X-Nonce  ·  X-Session
import { newNonce, sign } from '../../../shared/signature.js';

export class ApiError extends Error {
  constructor(status, code, details = {}) { super(code); this.status = status; this.code = code; this.details = details; }
}

export class ApiClient {
  #clockOffset = 0;      // diferencia entre el reloj del servidor y el del teléfono

  /**
   * @param {{ baseUrl: string, getSession: () => Promise<{ id: string, key: Uint8Array } | null>,
   *           fetch?: typeof fetch, now?: () => number }} options  `getSession` lee del Keystore/Keychain
   */
  constructor({ baseUrl, getSession, fetch: fetchFn = (...a) => fetch(...a), now = Date.now }) {
    this.baseUrl = baseUrl; this.getSession = getSession; this.fetch = fetchFn; this.now = now;
  }

  /** @type {import('./ports.js').Api['request']} */
  async request(method, path, data) {
    try { return await this.#send(method, path, data); }
    catch (error) {
      // El reloj del teléfono está corrido: se pregunta la hora al servidor y se reintenta una vez.
      if (!(error instanceof ApiError) || error.code !== 'reloj_desfasado') throw error;
      const health = await (await this.fetch(this.baseUrl + '/health')).json();
      this.#clockOffset = health.now - this.now();
      return this.#send(method, path, data);
    }
  }

  async #send(method, path, data) {
    const session = await this.getSession();
    if (!session) throw new ApiError(401, 'sin_sesion');
    const body = data === undefined ? '' : JSON.stringify(data);
    const timestamp = String(this.now() + this.#clockOffset), nonce = newNonce();
    const response = await this.fetch(this.baseUrl + '/v2' + path, {
      method,
      body: body || undefined,
      headers: {
        'content-type': 'application/json', 'x-session': session.id, 'x-timestamp': timestamp, 'x-nonce': nonce,
        'x-signature': await sign(session.key, body, timestamp, nonce),
      },
    });
    if (response.status === 204) return null;
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, json.error ?? 'error', json);
    return json;
  }
}
