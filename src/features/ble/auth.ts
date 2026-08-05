/**
 * §4.5 auth challenge–response handshake: read nonce, compute the CMAC
 * proof, write the two-frame authResponse.
 *
 * Stub for P0-4.0. Implementation lands in P1-4.0.
 */

export interface AuthSession {
  sessionId: string;
  keyGeneration: number;
  expiresAt: number;
}

export interface AuthHandshake {
  authenticate(deviceId: string, kSess: Uint8Array): Promise<AuthSession>;
}

export function createAuthHandshake(): AuthHandshake {
  throw new Error('P1-4.0');
}
