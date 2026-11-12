// Reglas del nombre de jugador, compartidas por la app (para avisar mientras escribe) y el servidor (que decide).
export const NAME_MIN = 3;
export const NAME_MAX = 12;
export const NAME_CHANGE_DAYS = 30;          // se puede cambiar una vez cada 30 días

/** Clave única del nombre: sin mayúsculas ni tildes («Matías» y «matias» son el mismo). Igual que en la V1. */
export const nameKey = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 24);

/** @returns {{ displayName: string, key: string } | null} null si el nombre no sirve */
export function parseName(input) {
  if (typeof input !== 'string') return null;
  const displayName = input.trim().replace(/\s+/g, ' ');
  const key = nameKey(displayName);
  const length = [...displayName].length;
  return length >= NAME_MIN && length <= NAME_MAX && key.length >= NAME_MIN ? { displayName, key } : null;
}
