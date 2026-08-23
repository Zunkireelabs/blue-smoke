// A no-network ESLint guard used to live here, scoped to
// src/features/verification/**. It was written for the on-device design,
// where raw ID/selfie frames crossed into JS and had to be stopped from
// leaving the device. P2-1.0 replaced that design with Persona's SDK, which
// captures and uploads the ID/selfie itself — our code never receives the
// raw image, DOB, or a biometric embedding, so there's nothing left in that
// subtree for the guard to protect. See CLAUDE.md's "verification" rules and
// docs/project-roadmap-todos/TODO-phase-2.md.
//
// P2-1.0 (follow-up) — restored, narrower. Deleting the old guard wholesale
// was defensible (see above), but it also silently zeroed out enforcement
// for two rules that are still live in CLAUDE.md and were never about raw
// image data in the first place:
//   1. "Never log or persist an inquiry_id alongside anything that could
//      re-identify the underlying document or selfie."
//   2. "Add analytics or crash reporting to the verification subtree. Ever."
// The retroactive review (docs/audits/P2-1.0-retroactive-review.md, finding
// F1) proved the gap empirically: a console.log of an inquiry_id next to an
// email lints clean without this file.
//
// ── What this restores, and — just as important — what it does NOT prove ──
// Rule 1 above is a DATA-FLOW property: "never log inquiry_id alongside
// anything re-identifying." ESLint has no data-flow analysis, so it cannot
// see `const p = { id: inquiryId, who: user.email }; logger.info(p)` — the
// pairing happens through a variable, not a syntax pattern. The overrides
// below are a TRIPWIRE for the direct case that actually happens in
// practice (someone debugging drops in `console.log(inquiryId)` and it
// survives review), not a proof of the pairing rule. Nothing in this file
// should be read as "the inquiry_id rule is enforced" — it isn't, and can't
// be, by a linter. Rule 2 (no analytics/crash-reporting in this data path,
// ever) IS a syntactic property — an import either exists or it doesn't —
// so that half genuinely is enforced, not just tripwired.
const VERIFICATION_IMPORT_MESSAGE =
  'src/features/verification/** may not import analytics, crash-reporting, or persistence ' +
  'modules. CLAUDE.md bans analytics/crash-reporting in this subtree unconditionally, and ' +
  'persisting anything here risks writing an inquiry_id somewhere it can later be joined ' +
  'back to a re-identifying value.';

const EDGE_ANALYTICS_MESSAGE =
  'persona-webhook and create-inquiry hold an inquiry_id (persona-webhook holds a user_id in ' +
  'the same request too) — CLAUDE.md\'s "no analytics or crash reporting in the ' +
  'verification path" rule is about that data, not about which directory the code lives in.';

const INQUIRY_ID_IN_CONSOLE_MESSAGE =
  'Do not pass an inquiry_id-shaped identifier to console.* (CLAUDE.md: "never log or persist ' +
  'an inquiry_id alongside anything that could re-identify the person"). This only catches the ' +
  'direct case — it is a tripwire, not proof the pairing rule was followed; wrapping the same ' +
  'value in an object first will not be caught.';

/**
 * Restored analytics/crash-reporting import ban, recovered verbatim (paths + patterns) from
 * the pre-P2-1.0 guard — see `git show 3ed7189 -- .eslintrc.js` — with an updated message. The
 * package list itself hasn't changed: it was never about the on-device image pipeline, it was
 * always "nothing in the verification path may leave via analytics/crash-reporting."
 */
const ANALYTICS_IMPORT_PATTERNS = [
  {
    // @sentry/*, @react-native-firebase/{analytics,crashlytics}, and any package with
    // "analytics"/"crashlytics" in its name.
    group: [
      '@sentry/*',
      '@react-native-firebase/analytics',
      '@react-native-firebase/crashlytics',
      '*analytics*',
      '*crashlytics*',
    ],
    message: VERIFICATION_IMPORT_MESSAGE,
  },
  {
    // The project's own logger module, once one exists, by either its path alias or a
    // relative import.
    group: ['@/shared/lib/logger*', '**/shared/lib/logger*'],
    message: VERIFICATION_IMPORT_MESSAGE,
  },
];

// P1-3.0 §3.4 — "prove it cannot ship." `tools/mock-peripheral` is pure-Node test/dev tooling
// (Buffer, and previously node:crypto too — see deviceCore.ts's module doc comment); a fake BLE
// stack reachable from any real (non-test) app code path is a device that unlocks without a
// device (CLAUDE.md's authority model). The one sanctioned import is `src/app/providers.tsx`'s
// `__DEV__`-gated wiring point (P1-3.0) — everything else under `src/` is production code that
// ships in a release build and must never reach it, `__tests__/**` files are the other
// legitimate caller (they drive the mock directly, never through the app's real composition
// root). Verified firing on this repo's ESLint 8.57.1 by
// tools/lint-guard/__tests__/mockPeripheralImportGuard.test.ts.
const MOCK_PERIPHERAL_IMPORT_MESSAGE =
  'tools/mock-peripheral may only be imported from src/app/providers.tsx (the __DEV__-gated ' +
  'dev BLE wiring point, P1-3.0) or from __tests__/** files. A fake BLE stack reachable from ' +
  'any other production path is a device that unlocks without a device — see CLAUDE.md\'s ' +
  'authority model.';

const MOCK_PERIPHERAL_IMPORT_PATTERN = {
  group: ['**/tools/mock-peripheral/**', '**/tools/mock-peripheral'],
  message: MOCK_PERIPHERAL_IMPORT_MESSAGE,
};

module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // 3.1 — the RN verification subtree. Zero console.* here today (verified before adding
      // this), so no-console costs nothing; it is the exact rule that stops
      // console.log(inquiryId) in the app.
      files: ['src/features/verification/**/*.{js,jsx,ts,tsx}'],
      rules: {
        'no-console': 'error',
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@react-native-async-storage/async-storage',
                message: VERIFICATION_IMPORT_MESSAGE,
              },
              {
                name: 'react-native-fs',
                message: VERIFICATION_IMPORT_MESSAGE,
              },
              {
                name: 'react-native-mmkv',
                message: VERIFICATION_IMPORT_MESSAGE,
              },
              {
                // Kept restricted deliberately, not carried over by default: nothing in this
                // subtree has a reason to touch secure storage. The only credential-shaped
                // value that ever passes through here is inquiry_id, and it isn't a
                // credential — there is nothing this subtree should be persisting, keychain
                // included. If a future increment needs it for a real reason, that is a
                // one-line override at the point of use, not a reason to drop the ban here.
                name: 'react-native-keychain',
                message: VERIFICATION_IMPORT_MESSAGE,
              },
            ],
            patterns: [...ANALYTICS_IMPORT_PATTERNS, MOCK_PERIPHERAL_IMPORT_PATTERN],
          },
        ],
      },
    },
    {
      // P1-3.0 §3.4 — the mock-import guard for the rest of `src/`. Deliberately its own
      // override, not folded into the verification-subtree one above: ESLint overrides don't
      // merge a rule's options across matching entries for the same file — the LAST matching
      // override wins outright — so if this lived in a second override that also matched
      // `src/features/verification/**`, it would silently replace (not add to) that subtree's
      // `no-restricted-imports` config instead of extending it. `excludedFiles` keeps this
      // override from ever applying to a verification-subtree file in the first place, so the
      // two never collide; the verification subtree gets this same protection via
      // `MOCK_PERIPHERAL_IMPORT_PATTERN` folded into its own override above instead.
      files: ['src/**/*.{js,jsx,ts,tsx}'],
      excludedFiles: ['src/app/providers.tsx', 'src/features/verification/**', '**/__tests__/**'],
      rules: {
        'no-restricted-imports': ['error', { patterns: [MOCK_PERIPHERAL_IMPORT_PATTERN] }],
      },
    },
    {
      // 3.2 — the two Edge Functions that hold an inquiry_id. Deliberately NO no-console
      // here: both functions have 9 combined console.error call sites doing legitimate
      // operational logging (none of them logging an identifier), and a blanket ban would
      // either break the build or push someone into deleting real diagnostics. Instead, a
      // targeted selector flags only an inquiry_id-shaped identifier appearing inside a
      // console.* call — verified firing on this repo's ESLint 8.57.1 by
      // tools/lint-guard/__tests__/verificationGuard.test.ts.
      files: [
        'supabase/functions/persona-webhook/**/*.{js,ts}',
        'supabase/functions/create-inquiry/**/*.{js,ts}',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "CallExpression[callee.object.name='console'] Identifier[name=/inquiry_?[iI]d/]",
            message: INQUIRY_ID_IN_CONSOLE_MESSAGE,
          },
        ],
        'no-restricted-imports': [
          'error',
          {
            // Patterns only here, not the RN storage paths (async-storage / react-native-fs /
            // mmkv / keychain) — those packages aren't importable from Deno and restricting
            // them would be restricting nothing. The analytics/crash-reporting ban is the part
            // that's about the data, not the runtime, so that's the part that travels.
            patterns: [
              { group: ANALYTICS_IMPORT_PATTERNS[0].group, message: EDGE_ANALYTICS_MESSAGE },
              { group: ANALYTICS_IMPORT_PATTERNS[1].group, message: EDGE_ANALYTICS_MESSAGE },
            ],
          },
        ],
      },
    },
  ],
};
