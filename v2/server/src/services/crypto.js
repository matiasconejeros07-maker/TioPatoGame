// Utilidades de criptografía (WebCrypto).
import { b64url, b64urlDecode } from './jwt.js';

const encoder = new TextEncoder();
export const utf8 = (text) => encoder.encode(text);
export const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? utf8(bytes) : bytes));
export const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async (data) => toHex(await sha256(data));
export const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
export const equalBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export const fromBase64 = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Cifra datos sensibles que hay que guardar en la base (p. ej. el refresh token de Apple). AES-256-GCM. */
export class SecretBox {
  #key;
  constructor(masterSecret) { this.#key = sha256('secretbox:' + masterSecret).then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])); }
  async seal(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.#key, utf8(text)));
    return b64url(concat(iv, data));
  }
  async open(sealed) {
    const bytes = b64urlDecode(sealed);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await this.#key, bytes.slice(12)));
  }
}
