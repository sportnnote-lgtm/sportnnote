/** Verify a Firebase phone-auth ID token (Google RS256 keys, our project, fresh).
 *  Returns the verified E.164 phone number, or an Error with a user-facing message.
 *  Secret: FIREBASE_PROJECT_ID. */
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';

const PROJECT = Deno.env.get('FIREBASE_PROJECT_ID') ?? '';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const FRESH_SECONDS = 600;

export const firebaseConfigured = () => !!PROJECT;

export async function verifiedPhoneFromToken(idToken: string): Promise<string | Error> {
  if (!PROJECT) return new Error('SMS verification isn’t configured yet.');
  try {
    const { payload } = await jwtVerify(idToken, JWKS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
    const authTime = Number(payload.auth_time ?? 0);
    if (!authTime || Date.now() / 1000 - authTime > FRESH_SECONDS) return new Error('That code is too old — request a new one.');
    const phone = String(payload.phone_number ?? '');
    return phone ? phone : new Error('No phone number in the verification.');
  } catch (e) {
    console.error('firebase token rejected', e);
    return new Error('Couldn’t confirm the SMS code — try again.');
  }
}
