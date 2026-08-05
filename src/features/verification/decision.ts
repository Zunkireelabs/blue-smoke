/**
 * The single PASS/FAIL orchestrator for age verification — spec §9.2 rule 2.
 *
 * This is the only module under features/verification/ that may export
 * outward. Its return type is exactly { passed, method, thresholdVersion,
 * outcomeReason } — not the DOB, not the score, not the crop.
 *
 * Stub for P0-4.0. Implementation lands in P2-6.0.
 */

export type OutcomeReason =
  | 'pass'
  | 'under_18'
  | 'face_mismatch'
  | 'ocr_failed'
  | 'liveness_failed';

export interface VerificationDecision {
  passed: boolean;
  method: string;
  thresholdVersion: string;
  outcomeReason: OutcomeReason;
}

export async function decide(): Promise<VerificationDecision> {
  throw new Error('P2-6.0');
}
