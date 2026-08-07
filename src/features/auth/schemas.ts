import { z } from 'zod';

/**
 * P1-1.0 — Zod schemas for Method A (email + password) and the client-side
 * shape of Method B (phone + OTP). Spec §1.2 / §1.2.1.
 *
 * Password strength: no policy is specified anywhere in TECHNICAL_SPEC.md.
 * `MIN_PASSWORD_LENGTH` below is a placeholder floor, not a spec value — it
 * must be confirmed against (and kept in sync with) the Supabase project's
 * own Auth password policy (Dashboard → Authentication → Policies), since a
 * mismatch between client-side and server-side rules just means confusing
 * server rejections after client-side validation already passed.
 */
const MIN_PASSWORD_LENGTH = 8;

export const emailSchema = z.email({ message: 'Enter a valid email address.' });

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

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
