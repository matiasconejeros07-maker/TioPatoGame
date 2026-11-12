// JWT con WebCrypto (sin dependencias): firmar (ES256 / RS256) y verificar RS256 contra un juego de claves públicas (JWKS).
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64urlDecode = (text) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64urlJson = (obj) => b64url(encoder.encode(JSON.stringify(obj)));

const ALGORITHMS = {
  ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' },
  RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
};

/** Clave privada PKCS#8 en PEM (el .p8 de Apple, el `private_key` de una cuenta de servicio de Google). */
function importPrivateKey(pem, alg) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, ALGORITHMS[alg], false, ['sign']);
}

export async function signJwt(alg, privateKeyPem, header, payload) {
  const input = `${b64urlJson({ alg, typ: 'JWT', ...header })}.${b64urlJson(payload)}`;
  const key = await importPrivateKey(privateKeyPem, alg);
  return `${input}.${b64url(await crypto.subtle.sign(ALGORITHMS[alg], key, encoder.encode(input)))}`;
}

/** Lee un JWT/JWS SIN verificar la firma. Úsalo solo con datos que llegaron directo de la tienda por HTTPS. */
export function decodeJwt(token) {
  const [header, payload, signature] = String(token).split('.');
  if (!header || !payload || !signature) throw new Error('JWT mal formado');
  const parse = (part) => JSON.parse(decoder.decode(b64urlDecode(part)));
  return { header: parse(header), payload: parse(payload), signature, input: `${header}.${payload}` };
}

/** Verifica la firma RS256 con la clave `kid` del JWKS. Devuelve el payload o lanza un error. */
export async function verifyRs256(token, jwks) {
  const { header, payload, signature, input } = decodeJwt(token);
  if (header.alg !== 'RS256') throw new Error('Algoritmo no admitido');
  const jwk = (jwks.keys ?? []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Clave de firma desconocida');
  const key = await crypto.subtle.importKey('jwk', jwk, ALGORITHMS.RS256, false, ['verify']);
  if (!(await crypto.subtle.verify(ALGORITHMS.RS256, key, b64urlDecode(signature), encoder.encode(input))))
    throw new Error('Firma inválida');
  return payload;
}
