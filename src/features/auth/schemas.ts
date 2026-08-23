import { z } from 'zod';

/**
 * P1-1.0 — Zod schemas for email (a 6-digit code, spec §1.2.2) and the
 * client-side shape of Method B (phone + OTP, spec §1.2.1). Email is the
 * only front door: there is no separate signup/login schema, and no reset
 * schema — the code is the recovery path.
 *
 * `passwordSchema` now routes: PR 2 wires it into `setPasswordSchema` below
 * for "Set a password" in Settings, and directly for "Use password instead"
 * sign-in — password sign-in itself is a later credential, not a competing
 * front door (see `client.ts`). `signupSchema`, `loginSchema` and
 * `passwordResetRequestSchema` do not survive: they validated forms PR 1
 * deleted.
 *
 * Password strength: no policy is specified anywhere in TECHNICAL_SPEC.md.
 * `MIN_PASSWORD_LENGTH` below is kept at 8, stricter than the confirmed
 * server floor of **6** (measured live against `bluesmoke-dev`, 2026-08-11 —
 * Dashboard → Authentication → Policies). Stricter-than-server is safe: it
 * only ever rejects client-side something the server would also reject, and
 * never accepts something the server won't. Do not lower this to 6 without a
 * deliberate product call — the gap between the two is what stops confusing
 * server rejections after client-side validation already passed.
 */
const MIN_PASSWORD_LENGTH = 8;

export const emailSchema = z.email({ message: 'Enter a valid email address.' });

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

/**
 * PR 2 — "Set a password" in Settings. No current-password field: Supabase's
 * "Secure password change" is confirmed OFF on `bluesmoke-dev` (measured
 * live, 2026-08-11), so `updateUser({ password })` only needs a live
 * session, not reauthentication. `confirmPassword` exists purely to catch a
 * fat-fingered retype client-side — the server never sees it.
 */
export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/**
 * PR 2 — "Use password instead" sign-in. Deliberately not `emailCodeRequestSchema`
 * plus a bolted-on password field: this is its own schema because it serves a
 * different call (`signInWithEmail`, not `requestEmailCode`) even though the
 * email half is identical.
 */
export const passwordSignInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});
export type PasswordSignInInput = z.infer<typeof passwordSignInSchema>;

/**
 * The email a 6-digit code is sent to — signup and sign-in alike. Named for
 * the flow it serves rather than "email form" so the one place that
 * validates an auth email stays obviously tied to the code path that owns
 * it.
 */
export const emailCodeRequestSchema = z.object({
  email: emailSchema,
});
export type EmailCodeRequestInput = z.infer<typeof emailCodeRequestSchema>;

/**
 * Method B (§1.2.1) phone shape. This is a permissive E.164 check only — the
 * project's TODO for the phone-input *screen* (P1-1.0 Method B) calls for
 * `libphonenumber-js` for country-aware formatting/validation, which is a UI
 * concern and not yet an installed dependency. Do not extend this schema to
 * do that job; add the library (and announce it — package.json is a
 * contested shared file, CLAUDE.md) when the phone input screen is built.
 */
export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Enter a phone number in international format, e.g. +14155552671.');

export const phoneRequestOtpSchema = z.object({
  phone: phoneE164Schema,
});
export type PhoneRequestOtpInput = z.infer<typeof phoneRequestOtpSchema>;

export const phoneVerifyOtpSchema = z.object({
  phone: phoneE164Schema,
  code: z.string().length(6, 'Enter the 6-digit code.').regex(/^\d{6}$/, 'Code must be numeric.'),
});
export type PhoneVerifyOtpInput = z.infer<typeof phoneVerifyOtpSchema>;
