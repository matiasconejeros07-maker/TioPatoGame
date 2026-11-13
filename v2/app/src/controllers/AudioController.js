// Decide qué suena y cuándo, según las preferencias del jugador y el sonido de rebote que lleva puesto.
import { DEFAULT_EQUIPPED } from '../../../shared/store.js';

export class AudioController {
  /**
   * @param {{ audio: import('../services/AudioService.js').AudioService, settings: import('../models/SettingsModel.js').SettingsModel,
   *           inventory: import('../models/InventoryModel.js').InventoryModel, preferences?: { load(): object, save(prefs: object): void } }} deps
   */
  constructor({ audio, settings, inventory, preferences }) {
    this.audio = audio; this.settings = settings; this.inventory = inventory; this.preferences = preferences;
    const saved = preferences?.load() ?? {};
    if (saved.sound === false) settings.sound = false;
    if (saved.music === false) settings.music = false;
    settings.on('change', () => preferences?.save({ sound: settings.sound, music: settings.music }));
  }

  /** Primer toque del jugador: los navegadores no dejan sonar antes. */
  unlock() { if (this.audio.unlock()) this.#syncMusic(); }

  play(name) { if (this.settings.sound) this.audio.play(name); }
  /** El rebote en la barra, con el sonido equipado. */
  bounce(pitch) { if (this.settings.sound) this.audio.bounce(this.inventory.equipped.sfx ?? DEFAULT_EQUIPPED.sfx, pitch); }
  /** Escuchar un sonido de rebote en la tienda antes de comprarlo. */
  preview(id) { this.unlock(); if (this.settings.sound) this.audio.bounce(id, 0); }

  toggleSound() { this.settings.sound = !this.settings.sound; if (this.settings.sound) this.play('tap'); }
  toggleMusic() { this.settings.music = !this.settings.music; this.#syncMusic(); }

  matchStarted() { this.unlock(); }
  matchEnded() { this.play('lose'); }

  #syncMusic() { if (this.settings.music) this.audio.startMusic(); else this.audio.stopMusic(); }
}
