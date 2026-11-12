// Android · Google Play Games Services v2 (@modbender/capacitor-play-games).
import { PlayGames } from '@modbender/capacitor-play-games';

/** @implements {import('../ports.js').IdentityService} */
export class PlayGamesSignInService {
  /** @param {{ serverClientId: string }} config  el cliente OAuth «Aplicación web» (el mismo PLAY_GAMES_CLIENT_ID del servidor) */
  constructor(config) { this.config = config; }

  async signIn() {
    let state = await PlayGames.signIn({ silent: true });
    if (!state.signedIn) state = await PlayGames.signIn();
    if (!state.signedIn) throw { cancelled: true };
    // Código de un solo uso que el servidor canjea con Google por el id del jugador.
    const { authCode } = await PlayGames.requestServerSideAccess({ serverClientId: this.config.serverClientId, forceRefresh: false });
    return { serverAuthCode: authCode };
  }
}
