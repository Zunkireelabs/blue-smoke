/**
 * Which face the auth screens wear.
 *
 * 🔴 This is copy, not a code path. There is exactly one authentication flow in this app — the
 * same 6-digit code serves a brand-new address and a returning one identically, which is why
 * P1-1.0 retired the separate Signup/Login screens (AU-2/3/4). `mode` changes the headline and
 * the legal sentence and nothing else. Do not branch a request, an endpoint, or a validation
 * rule on it: a "sign in" that behaves differently from a "sign up" would be a new backend
 * contract, not a restyle.
 */
export type AuthMode = 'signup' | 'signin';

export const DEFAULT_AUTH_MODE: AuthMode = 'signup';

/** Copy that differs between the two modes. One table, so the two screens can never drift. */
export const AUTH_MODE_COPY: Record<
  AuthMode,
  {
    heading: string;
    legal: string;
    switchLabel: string;
    switchTo: AuthMode;
    /**
     * The sentence introducing the password alternative on the email screen.
     *
     * The reference offers "Set Password" in signup and "Use Password" in login. We only have
     * the second: `SetPassword` lives in the *authenticated* stack, so there is no pre-auth
     * create-an-account-with-a-password flow to send anyone to. Both modes therefore point at
     * `PasswordSignIn` (AU-14) — same destination the screen already had — and the signup copy
     * is worded so it doesn't promise a screen that doesn't exist.
     */
    passwordPrompt: string;
  }
> = {
  signup: {
    heading: "Let's create your account",
    legal: 'By signing up, I agree to the Terms of Service and Privacy Policy.',
    switchLabel: 'Already a user?',
    switchTo: 'signin',
    passwordPrompt: 'Already set a password?',
  },
  signin: {
    heading: 'Welcome back, log in to continue',
    legal: 'By signing in, I accept the Terms & Conditions.',
    switchLabel: 'New user?',
    switchTo: 'signup',
    passwordPrompt: 'Prefer logging in with a password?',
  },
};

/** Shared by both modes — see `passwordPrompt`. */
export const PASSWORD_LINK_LABEL = 'Use password';
