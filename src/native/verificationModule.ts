/**
 * Shared TypeScript interface implemented by both native ML bridges —
 * Apple Vision (src/native/ios/VisionVerification.swift) and ML Kit
 * (src/native/android/MLKitVerification.kt). One interface, two platform
 * implementations, so `decision.ts` (P2-6.0) can consume either without a
 * platform branch outside this module.
 *
 * Stub for P0-4.0. Native bridge implementations are a separate task (M2).
 */

export interface OcrResult {
  dateOfBirth: string | null;
  confidence: number;
}

export interface FaceMatchResult {
  similarity: number;
  thresholdVersion: string;
}

export interface LivenessResult {
  passed: boolean;
}

/**
 * The on-device ML surface. Every method operates on in-memory buffers only
 * — no argument or return value here may be logged, persisted, or leave the
 * device. See CLAUDE.md's three inviolable rules.
 */
export interface VerificationModule {
  extractDateOfBirth(idImage: Uint8Array): Promise<OcrResult>;
  matchFaces(idImage: Uint8Array, selfieImage: Uint8Array): Promise<FaceMatchResult>;
  checkLiveness(selfieFrames: readonly Uint8Array[]): Promise<LivenessResult>;
}
