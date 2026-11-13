// Ayudas mínimas para las vistas.
export const money = (n) => '$' + Math.round(n).toLocaleString('es-CL');
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const COIN = 'skins/peso1.webp';

/** Un solo oyente por vista: cada botón lleva `data-act` y, si hace falta, `data-arg`. */
export function actions(root, handlers) {
  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-act]');
    if (el && root.contains(el) && !el.disabled) handlers[el.dataset.act]?.(el.dataset.arg, el);
  });
}
/** Reinicia una animación CSS de una clase. */
export function replay(el, name, ms) {
  el.classList.remove(name); void el.offsetWidth; el.classList.add(name);
  if (ms) setTimeout(() => el.classList.remove(name), ms);
}
