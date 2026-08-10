/**
 * Dev-only screen gallery — the data behind every placeholder screen.
 *
 * ── What this is, and what it is NOT ──────────────────────────────────────────────────
 *
 * This is scaffolding so the whole app surface can be WALKED before design references exist.
 * It is not a design, and none of these screens are implementations. Each entry renders as a
 * rough, honest placeholder built from the real kit (`src/shared/ui`) and the real tokens, so
 * what you see is the current visual system — not a proposal.
 *
 * IDs match `docs/system-design-ux/SCREEN_MAP.md` exactly, which in turn maps to the flow node
 * IDs in `docs/system-design-ux/USER_FLOWS.md`. Quote the ID to attach a design reference.
 *
 * 🔴 DEV ONLY. The gallery is mounted behind `__DEV__` in `src/app/navigation.tsx` and must
 * never be reachable in a release build. It is also not a PRD task — it is throwaway tooling
 * for the design pass, and each entry should be DELETED as the real screen replaces it.
 *
 * 🔴 Persona owns ID capture and selfie UI. No entry here depicts them, and none should be
 * added — those screens live in the vendor's SDK, in its own process (inviolable rule 1).
 */

export type SectionId = 'SH' | 'ON' | 'AU' | 'VF' | 'DV' | 'LK' | 'PF' | 'SY';

export type ScreenStatus = 'built' | 'partial' | 'stub' | 'absent' | 'blocked';

/**
 * Rough shape of the screen. Not a design decision — just enough differentiation that a
 * form does not read as a status screen when you are flicking through 62 of them.
 */
export type Layout = 'message' | 'form' | 'list' | 'status' | 'carousel' | 'loading' | 'notification';

export type CtaKind = 'primary' | 'secondary' | 'destructive';

export interface Cta {
  label: string;
  kind?: CtaKind;
  /** Screen ID this leads to, when the flow says so. Shown as a hint, not wired. */
  to?: string;
}

export interface ScreenSpec {
  id: string;
  name: string;
  section: SectionId;
  status: ScreenStatus;
  /** `USER_FLOWS.md` node id. */
  node?: string;
  layout: Layout;
  /** Copy as it would appear on screen. Real copy where the flows doc specifies it. */
  title: string;
  body?: string;
  /** Field labels, for `form`. */
  fields?: string[];
  /** Row labels, for `list`. */
  rows?: string[];
  ctas?: Cta[];
  /** Constraint a designer must know. Rendered in a footer strip, never as screen copy. */
  note?: string;
}

export const SECTIONS: ReadonlyArray<{ id: SectionId; name: string; blurb: string }> = [
  { id: 'SH', name: 'Shell', blurb: 'App boot' },
  { id: 'ON', name: 'Onboarding & permissions', blurb: 'Primed at the moment of need' },
  { id: 'AU', name: 'Authentication', blurb: 'Mostly built' },
  { id: 'VF', name: 'Age verification', blurb: 'Worst CTA gaps' },
  { id: 'DV', name: 'Devices & pairing', blurb: 'Critical path' },
  { id: 'LK', name: 'Lock & unlock', blurb: 'The product' },
  { id: 'PF', name: 'Profile & settings', blurb: '6 of 7 unowned' },
  { id: 'SY', name: 'System surfaces', blurb: 'Outside the app frame' },
];

export const SCREEN_SPECS: ReadonlyArray<ScreenSpec> = [
  // ── SH ────────────────────────────────────────────────────────────────────────────
  {
    id: 'SH-1', name: 'Boot splash', section: 'SH', status: 'built', layout: 'loading',
    title: '', body: '',
    note: 'First frame on every launch. Currently an unbranded system spinner.',
  },

  // ── ON ────────────────────────────────────────────────────────────────────────────
  // ON-1..3 are BUILT (P1-2.0, `OnboardingCarouselScreen`) and walkable via the real
  // pre-auth flow (first launch / after `simctl uninstall` clears the AsyncStorage flag) —
  // placeholder entries removed, matching how VF-1/ON-5/etc's were removed in Phase B.
  //
  // ON-4/7/8/9 shipped their real trigger this phase (P1-3.0, device pairing: `Home` → "Pair a
  // device" → `BluetoothPriming` → `BluetoothGate`) — placeholders removed the same way.
  // ON-6 stays: notification priming is F7.9, past P1-3.0's pairing boundary, so
  // `ScreenPreviewScreen` still renders the real component via `realPreviews.tsx`.
  {
    id: 'ON-6', name: 'Notification priming', section: 'ON', status: 'built', layout: 'message',
    title: 'Know when it locks',
    body: 'We can tell you when your device locks itself or runs low on battery.',
    note: 'Real component (P1-2.0). Enable is a stub interface — push has no backend yet.',
  },

  // ── AU ────────────────────────────────────────────────────────────────────────────
  {
    id: 'AU-1', name: 'Auth method choice', section: 'AU', status: 'built', node: 'F1.4', layout: 'message',
    title: 'Sign up or log in',
    ctas: [
      { label: 'Continue with Email', kind: 'primary', to: 'AU-4' },
      { label: 'Continue with Phone', kind: 'primary', to: 'AU-5' },
    ],
    note: 'Neither method pre-selected — equal weight is deliberate.',
  },
  {
    id: 'AU-2', name: 'Sign up', section: 'AU', status: 'built', node: 'F2', layout: 'form',
    title: 'Create account',
    fields: ['Email', 'Password', 'Confirm password'],
    ctas: [{ label: 'Sign up', kind: 'primary' }, { label: 'Already have an account? Log in', kind: 'secondary', to: 'AU-4' }],
  },
  {
    id: 'AU-3', name: 'Check your email — signup', section: 'AU', status: 'partial', node: 'F2.6', layout: 'message',
    title: 'Check your email',
    body: 'We sent a confirmation link to finish creating your account.',
    ctas: [
      { label: 'Resend', kind: 'primary' },
      { label: 'Change email address', kind: 'secondary' },
      { label: 'Use phone instead', kind: 'secondary', to: 'AU-5' },
    ],
    note: 'DEAD END today — ships with no buttons at all. The three above are the fix.',
  },
  {
    id: 'AU-4', name: 'Log in', section: 'AU', status: 'built', node: 'F4', layout: 'form',
    title: 'Log in',
    fields: ['Email', 'Password'],
    ctas: [
      { label: 'Log in', kind: 'primary' },
      { label: 'Forgot password?', kind: 'secondary', to: 'AU-8' },
      { label: 'New here? Create an account', kind: 'secondary', to: 'AU-2' },
    ],
  },
  {
    id: 'AU-5', name: 'Phone number', section: 'AU', status: 'built', node: 'F3.1', layout: 'form',
    title: 'Enter your phone number',
    fields: ['Country', 'Phone number'],
    ctas: [{ label: 'Send code', kind: 'primary', to: 'AU-7' }],
  },
  {
    id: 'AU-6', name: 'Country picker', section: 'AU', status: 'built', node: 'F3.1', layout: 'list',
    title: 'Select country',
    rows: ['Search country', 'Australia (+61)', 'India (+91)', 'Nepal (+977)', 'United Kingdom (+44)', 'United States (+1)'],
    ctas: [{ label: 'Cancel', kind: 'secondary' }],
    note: 'A modal, not a route.',
  },
  {
    id: 'AU-7', name: 'OTP entry', section: 'AU', status: 'built', node: 'F3.5', layout: 'form',
    title: 'Enter the code',
    body: 'We sent a 6-digit code to +1 415 212 7777.',
    fields: ['6-digit code'],
    ctas: [{ label: 'Resend code in 30s', kind: 'secondary' }],
    note: 'Auto-submits at 6 digits. Missing a "change number" CTA.',
  },
  {
    id: 'AU-8', name: 'Forgot password', section: 'AU', status: 'built', node: 'F5.1', layout: 'form',
    title: 'Reset your password',
    body: "Enter the email on your account and we'll send you a link to reset your password.",
    fields: ['Email'],
    ctas: [{ label: 'Send reset link', kind: 'primary' }],
  },
  {
    id: 'AU-9', name: 'Check your email — reset', section: 'AU', status: 'partial', node: 'F5.3', layout: 'message',
    title: 'Check your email',
    body: 'If an account exists for that address, we sent a link to reset your password.',
    ctas: [{ label: 'Back to log in', kind: 'primary', to: 'AU-4' }],
    note: 'DEAD END today — no button, no navigation import.',
  },
  {
    id: 'AU-10', name: 'Set new password', section: 'AU', status: 'built', node: 'F5.6', layout: 'form',
    title: 'Choose a new password',
    fields: ['New password', 'Confirm new password'],
    ctas: [{ label: 'Update password', kind: 'primary' }],
    note: 'Unreachable while signed in — lives in the auth stack, which is not mounted.',
  },
  {
    id: 'AU-11', name: 'Password updated', section: 'AU', status: 'partial', node: 'F5.7', layout: 'message',
    title: 'Password updated',
    body: 'You can now log in with your new password.',
    ctas: [{ label: 'Continue', kind: 'primary', to: 'AU-4' }],
    note: 'DEAD END today — the worst of the three. User is simply left here.',
  },

  // ── VF ────────────────────────────────────────────────────────────────────────────
  // VF-1, ON-5, VF-2, VF-3, VF-4, VF-5, VF-6, VF-7, VF-12 shipped as real screens this
  // phase (P2-6.0 / UI-BUILD-B) — their placeholders are removed per this repo's convention
  // that the gallery only carries screens that don't exist yet. VF-8/9/10 (the decline
  // ladder) and VF-11 (manual review) remain: both explicitly out of scope this phase — see
  // docs/execution-briefs/UI-BUILD-B-seam-and-verification.md §3 and §4.
  {
    id: 'VF-8', name: 'Declined — attempts 1–3', section: 'VF', status: 'absent', node: 'F6.D1', layout: 'message',
    title: "We couldn't confirm your ID",
    body: 'Try again in good light, with the whole card flat in frame.',
    ctas: [{ label: 'Try again', kind: 'primary' }, { label: 'Sign out', kind: 'secondary' }],
    note: 'Coaching only. Never a score, never a reason that reveals matching internals.',
  },
  {
    id: 'VF-9', name: 'Declined — attempts 4–5', section: 'VF', status: 'absent', node: 'F6.D2', layout: 'message',
    title: "That still didn't work",
    body: 'A different form of ID sometimes helps.',
    ctas: [
      { label: 'Try again', kind: 'primary' },
      { label: 'Having trouble?', kind: 'secondary', to: 'VF-11' },
      { label: 'Sign out', kind: 'secondary' },
    ],
  },
  {
    id: 'VF-10', name: 'Locked out 30 minutes', section: 'VF', status: 'absent', node: 'F6.D3', layout: 'status',
    title: 'Try again in 29:41',
    body: 'You have made several attempts. You can try again shortly, or get help now.',
    ctas: [{ label: 'Get help', kind: 'secondary', to: 'VF-11' }, { label: 'Sign out', kind: 'secondary' }],
    note: 'Needs a COUNTDOWN primitive — does not exist in the kit.',
  },
  {
    id: 'VF-11', name: 'Manual review fallback', section: 'VF', status: 'blocked', node: 'F6.F', layout: 'message',
    title: 'Let a person check',
    body: 'BLOCKED — OQ-2 has not answered who handles this, through what channel, or with what SLA.',
    ctas: [{ label: 'Contact support', kind: 'primary' }, { label: 'Sign out', kind: 'secondary' }],
    note: '⛔ Do not design until OQ-2 is answered. The route does not exist.',
  },

  // ── DV ────────────────────────────────────────────────────────────────────────────
  // DV-1..5 shipped this phase (P1-3.0: Home's real empty state through scan/results/timeout)
  // and are reachable via the real flow — placeholders removed, same convention as ON-4/7/8/9
  // above. DV-6 onward stay: they're past P1-3.0's hard boundary at device selection (OQ-12).
  {
    id: 'DV-6', name: 'Connecting / bonding / handshake', section: 'DV', status: 'blocked', node: 'F7.6–F7.9', layout: 'loading',
    title: 'Pairing…',
    body: 'Connecting · Bonding · Verifying',
    note: '⛔ OQ-12. A three-step progress surface, plus a biometric prompt before the session key.',
  },
  {
    id: 'DV-7', name: 'Paired — success', section: 'DV', status: 'blocked', node: 'F7.10', layout: 'status',
    title: 'Paired',
    body: 'Your BlueSmoke is ready.',
    ctas: [{ label: 'Continue', kind: 'primary', to: 'LK-3' }],
    note: '⛔ OQ-12.',
  },
  {
    id: 'DV-8', name: 'Pairing failures ×11', section: 'DV', status: 'absent', node: 'F7.E1–E11', layout: 'message',
    title: "That didn't work",
    body: 'One of eleven distinct failures. Each needs its own copy — no generic catch-all.',
    ctas: [{ label: 'Try again', kind: 'primary' }, { label: 'Forget and try again', kind: 'destructive' }],
    note: 'Two are ROUTING, not errors: AGE_NOT_VERIFIED → VF-1, and DEVICE_OWNED_BY_ANOTHER_USER. Incompatible firmware fails closed.',
  },
  {
    id: 'DV-9', name: 'Device detail', section: 'DV', status: 'absent', node: 'F8', layout: 'list',
    title: 'BlueSmoke',
    rows: ['Status · Connected', 'Battery · 82%', 'Lock state · Locked (as of 2s ago)', 'Rename', 'Unpair'],
    note: 'Battery must handle 0xFF = unknown. Lock state needs a STALENESS indicator — it is the last notification received, never a guess.',
  },
  {
    id: 'DV-10', name: 'Rename device', section: 'DV', status: 'absent', layout: 'form',
    title: 'Rename device',
    fields: ['Device name'],
    ctas: [{ label: 'Save', kind: 'primary' }, { label: 'Cancel', kind: 'secondary' }],
  },
  {
    id: 'DV-11', name: 'Unpair confirmation', section: 'DV', status: 'absent', layout: 'message',
    title: 'Unpair this device?',
    body: 'You will need to pair it again to unlock it. The device stays locked.',
    ctas: [{ label: 'Unpair', kind: 'destructive' }, { label: 'Cancel', kind: 'secondary' }],
    note: 'Needs a SHEET/MODAL and a DESTRUCTIVE button — neither exists in the kit.',
  },

  // ── LK ────────────────────────────────────────────────────────────────────────────
  {
    id: 'LK-1', name: 'Device not found', section: 'LK', status: 'absent', node: 'F8.1', layout: 'status',
    title: 'Locked',
    body: "We can't see your device. It locked itself when it went out of range.",
    ctas: [{ label: 'Reconnect', kind: 'primary' }],
    note: '🔴 Must state the device is LOCKED. Disconnected is the safe state — the firmware timer does this, not the app.',
  },
  {
    id: 'LK-2', name: 'Connecting…', section: 'LK', status: 'absent', node: 'F8.2', layout: 'loading',
    title: 'Connecting…',
    note: 'Transient with a bounded timeout. No unbounded await.',
  },
  {
    id: 'LK-3', name: 'Activate this device', section: 'LK', status: 'blocked', node: 'F8.3', layout: 'status',
    title: 'Activate your device',
    body: 'One-time setup before you can unlock it.',
    ctas: [{ label: 'Activate', kind: 'primary' }],
    note: '⛔ OQ-12. Requires age_verified server-side.',
  },
  {
    id: 'LK-4', name: 'Locked', section: 'LK', status: 'blocked', node: 'F8.4', layout: 'status',
    title: 'Locked',
    body: 'Battery 82% · Connected',
    ctas: [{ label: 'Unlock', kind: 'primary' }],
    note: '⛔ OQ-12. THE primary action of the entire app. Everything else is support.',
  },
  {
    id: 'LK-5', name: 'Unlocking…', section: 'LK', status: 'blocked', node: 'F8.5', layout: 'loading',
    title: 'Unlocking…',
    note: '🔴 PENDING, never "Unlocked". Notification-driven only. Rendering unlocked before the device confirms is a safety defect.',
  },
  {
    id: 'LK-6', name: 'Unlocked', section: 'LK', status: 'blocked', node: 'F8.6', layout: 'status',
    title: 'Unlocked',
    body: 'It will lock itself when you walk away.',
    ctas: [{ label: 'Lock', kind: 'primary' }],
    note: '⛔ OQ-12. The re-lock hint must be honest — the firmware timer does it, not the app.',
  },
  {
    id: 'LK-7', name: 'Auto-locked — out of range', section: 'LK', status: 'absent', node: 'F8.A1/A2', layout: 'status',
    title: 'Locked — you moved out of range',
    body: 'Your device locked itself.',
    ctas: [{ label: 'Reconnect', kind: 'primary' }],
  },
  {
    id: 'LK-8', name: 'Activation success', section: 'LK', status: 'absent', layout: 'status',
    title: "You're all set",
    body: 'Your BlueSmoke is activated and ready to unlock.',
    ctas: [{ label: 'Continue', kind: 'primary', to: 'LK-4' }],
    note: "The roadmap calls this the product's first real moment — the one place a celebratory treatment is wanted.",
  },

  // ── PF ────────────────────────────────────────────────────────────────────────────
  {
    id: 'PF-1', name: 'Account', section: 'PF', status: 'partial', node: 'F9.1', layout: 'list',
    title: 'Profile',
    rows: ['Signed in as · +14152127777', 'Display name · —', 'Age verification · Verified', 'Member since · 9 August 2026'],
    ctas: [{ label: 'Sign out', kind: 'primary' }],
    note: 'Built. Its error state has no sign-out — worth fixing, it is the only escape hatch.',
  },
  {
    id: 'PF-2', name: 'Security', section: 'PF', status: 'absent', node: 'F9.2', layout: 'list',
    title: 'Security',
    rows: ['Change password', 'Sign out of all devices'],
    note: 'No owning PRD task.',
  },
  {
    id: 'PF-3', name: 'Devices', section: 'PF', status: 'absent', node: 'F9.3', layout: 'list',
    title: 'Devices',
    rows: ['BlueSmoke · Connected', 'Spare · Out of range'],
    note: 'No owning PRD task.',
  },
  {
    id: 'PF-4', name: 'Notifications', section: 'PF', status: 'blocked', node: 'F9.4', layout: 'list',
    title: 'Notifications',
    rows: ['Lock status changes', 'Low battery'],
    note: '⛔ Push has no client code. Needs a TOGGLE primitive, which does not exist.',
  },
  {
    id: 'PF-5', name: 'Help & support', section: 'PF', status: 'blocked', node: 'F9.5', layout: 'list',
    title: 'Help & support',
    rows: ['Contact support', 'Verification help'],
    note: '⛔ OQ-2 — no support route exists.',
  },
  {
    id: 'PF-6', name: 'Legal', section: 'PF', status: 'blocked', node: 'F9.6', layout: 'list',
    title: 'Legal',
    rows: ['Privacy policy', 'Terms of service', 'App version'],
    note: '⛔ No privacy or terms URLs exist anywhere in the repo.',
  },
  {
    id: 'PF-7', name: 'Danger zone', section: 'PF', status: 'blocked', node: 'F9.7', layout: 'message',
    title: 'Delete account and data',
    body: 'This cannot be undone. Your devices will be unpaired and stay locked.',
    ctas: [{ label: 'Delete account', kind: 'destructive' }, { label: 'Cancel', kind: 'secondary' }],
    note: '⛔ OQ-11(d). Two-step confirm. Needs DESTRUCTIVE button + SHEET.',
  },

  // ── SY ────────────────────────────────────────────────────────────────────────────
  {
    id: 'SY-1', name: 'Android foreground-service notification', section: 'SY', status: 'absent', layout: 'notification',
    title: 'BlueSmoke · Locked',
    body: 'Connected · Battery 82%',
    note: 'Android only, persistent. Must show LIVE lock state — useful, not merely compliant.',
  },
  {
    id: 'SY-2', name: 'Push — lock state change', section: 'SY', status: 'absent', layout: 'notification',
    title: 'Your device locked itself',
    body: 'You moved out of range.',
    note: 'Deep-links to the device screen. Coalesced. No PII in the payload.',
  },
  {
    id: 'SY-3', name: 'Push — low battery', section: 'SY', status: 'absent', layout: 'notification',
    title: 'BlueSmoke battery low',
    body: '15% remaining.',
    note: 'Deep-links to the device screen. No PII in the payload.',
  },
];

export function specsForSection(section: SectionId): ScreenSpec[] {
  return SCREEN_SPECS.filter((s) => s.section === section);
}

export function specById(id: string): ScreenSpec | undefined {
  return SCREEN_SPECS.find((s) => s.id === id);
}
