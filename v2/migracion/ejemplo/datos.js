// Exportación de Firebase de ejemplo, con los casos que existen en la V1.
export const authUsers = [
  { localId: 'uidAna', email: 'ana@tio-pato.invalid', createdAt: '1750000000000' },                    // cuenta antigua: nombre + contraseña
  { localId: 'uidBeto', email: 'beto@correo.cl', displayName: 'Beto', createdAt: '1760000000000' },      // cuenta con correo real
  { localId: 'uidNueva', email: 'sin.jugar@correo.cl', createdAt: '1770000000000' },                     // creó la cuenta y nunca jugó
];

export const rtdb = {
  names: { ana: 'uidAna', 'beto,cl': 'uidBeto' },
  mynames: { uidBeto: 'beto.cl' },
  roles: { uidAna: 'dev' },
  marco: { uidBeto: true },
  compradores: { uidBeto: { n: 'Beto', t: 1765000000000 } },
  vip: { uidBeto: { w: '+56912345678', n: 'Beto', t: 1765000001000, c: true } },
  runs: { uidAna: { s: 1766000000000, b: 'c1', r: 1, e: 1766000090000, h: 120, p: 141 } },
  scores: {
    uidAna: { n: 'Ana', k: 'ana', s: 120, t: 1766000090000, ms: 5400000, ml: 1766000000000, c: 120 },
    uidBeto: { n: 'Beto', k: 'beto.cl', s: 431, t: 1766100000000, a: 'i03c07', ms: 86400000 },
  },
  weekly: { 2950: { uidAna: { n: 'Ana', s: 120 }, uidBeto: { n: 'Beto', s: 300 } } },
  monthly: { 202611: { uidBeto: { n: 'Beto', s: 431 } } },
  wallets: {
    uidAna: { c: 9000, sp: 2500, lr: 1766000000000, own: { bg_atardecer: true, pad_neon: true }, eq: { bg: 'atardecer', pad: 'neon', ball: 'c1', ch: 'pato' } },
    uidBeto: { c: 250000000, sp: 100500000, lr: 1766100000000, av: 'i03c07', own: { ch_millonario: true, ball_diamante: true, pad_midas: true }, eq: { ch: 'millonario', ball: 'diamante' } },
  },
  streaks: {
    uidAna: { n: 9, t: 1766000000000, x2: 1 },
    uidBeto: { n: 31, t: 1766100000000, x2: 0, x3: 1, x4: 2, y2: 1, bx: 1766099000000, bm: 3, bd: 600000 },
  },
  stats: {
    uidAna: { g: 80, r: 4100, sl: 1766000000000, d: 20440, dg: 2, dr: 150, dm: 120, dc: 1, w: 2950, wg: 5, wr: 300, wm: 120 },
    uidBeto: { g: 1900, r: 310000, sl: 1766100000000, mo: 202611, mm: 431, ml: 1766100000000 },
  },
  missions: { uidAna: { g1: true, g10: true, g50: true, b100: true }, uidBeto: { g1000: true, b300: true, s28: true, v1: true } },
  ruleta: { uidBeto: { t: 1766090000000, c: 1766090000000 } },
};
