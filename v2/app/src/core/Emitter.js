/** Avisos entre capas: los Modelos emiten cambios, las Vistas y Controladores se suscriben. */
export class Emitter {
  #listeners = new Map();
  /** @returns {() => void} función para dejar de escuchar */
  on(event, listener) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(listener);
    return () => this.#listeners.get(event).delete(listener);
  }
  emit(event, payload) { for (const listener of [...(this.#listeners.get(event) ?? [])]) listener(payload); }
}
