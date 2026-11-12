// iOS · Sign in with Apple (@capacitor-community/apple-sign-in).
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { APP_ID } from '../../../../shared/ids.js';

const sha256Hex = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** @implements {import('../ports.js').IdentityService} */
export class AppleSignInService {
  async signIn(challenge) {
    try {
      // El nonce queda dentro del token que firma Apple: el servidor comprueba que sea el de este intento.
      const { response } = await SignInWithApple.authorize({ clientId: APP_ID, redirectURI: '', scopes: '', nonce: await sha256Hex(challenge) });
      return { identityToken: response.identityToken, authorizationCode: response.authorizationCode };
    } catch (error) {
      if (/1001|cancel/i.test(String(error?.message ?? error))) throw { cancelled: true };     // ASAuthorizationError.canceled
      throw error;
    }
  }
}
