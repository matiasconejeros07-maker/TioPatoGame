import { isOffensive } from './profanity.js';

// Reglas del nombre de jugador, compartidas por la app (para avisar mientras escribe) y el servidor (que decide).
export const NAME_MIN = 3;
export const NAME_MAX = 12;
export const NAME_CHANGE_DAYS = 30;          // se puede cambiar una vez cada 30 días

/** Clave única del nombre: sin mayúsculas ni tildes («Matías» y «matias» son el mismo). Igual que en la V1. */
export const nameKey = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 24);

export const NameProblem = Object.freeze({ INVALID: 'nombre_invalido', OFFENSIVE: 'nombre_ofensivo' });

/** @returns {{ displayName: string, key: string } | { problem: string }} */
export function checkName(input) {
  if (typeof input !== 'string') return { problem: NameProblem.INVALID };
  const displayName = input.trim().replace(/\s+/g, ' ');
  const key = nameKey(displayName);
  const length = [...displayName].length;
  if (length < NAME_MIN || length > NAME_MAX || key.length < NAME_MIN) return { problem: NameProblem.INVALID };
  if (isOffensive(displayName)) return { problem: NameProblem.OFFENSIVE };
  return { displayName, key };
}
