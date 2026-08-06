const VERIFICATION_IMPORT_MESSAGE =
  'The 🔴 zone (src/features/verification/** and src/native/**) may not import ' +
  'logging, analytics, or persistence modules (CLAUDE.md rule 1 / spec §9.2): a ' +
  'crash during ID capture must not be capable of producing a report containing ' +
  'the ID.';

const VERIFICATION_TRANSMIT_MESSAGE =
  'The 🔴 zone may not transmit. Inviolable rule 1 forbids 🔴 data leaving the ' +
  'device at all, and rule 3 puts the age decision server-side via decision.ts — ' +
  'so nothing in this subtree has a legitimate reason to open a network call. ' +
  'Return a decision to the caller and let it do the I/O.';

module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Both halves of the 🔴 zone, per CLAUDE.md's codebase map: the feature
      // subtree orchestrates, but src/native/** is where the raw ID frames and
      // the DOB actually cross the bridge. Guarding only the first left the
      // data-carrying half unprotected (P0-6.0 audit, F2).
      files: [
        'src/features/verification/**/*.{js,jsx,ts,tsx}',
        'src/native/**/*.{js,jsx,ts,tsx}',
      ],
      rules: {
        'no-console': 'error',
        // Rule 1 forbids 🔴 data being "written to disk, logged, sent to a
        // crash reporter, or transmitted". The import list below covers the
        // first three; transmission needs the globals (P0-6.0 audit, F3).
        'no-restricted-globals': [
          'error',
          { name: 'fetch', message: VERIFICATION_TRANSMIT_MESSAGE },
          { name: 'XMLHttpRequest', message: VERIFICATION_TRANSMIT_MESSAGE },
        ],
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
                name: 'react-native-keychain',
                message: VERIFICATION_IMPORT_MESSAGE,
              },
              {
                // The transmission path with the worst failure mode: the
                // configured Supabase client would carry an ID image straight
                // off the device (P0-6.0 audit, F3).
                name: '@supabase/supabase-js',
                message: VERIFICATION_TRANSMIT_MESSAGE,
              },
            ],
            patterns: [
              {
                // @sentry/*, @react-native-firebase/{analytics,crashlytics}, and
                // any package with "analytics"/"crashlytics" in its name.
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
                // The project's own logger module, once one exists, by
                // either its path alias or a relative import.
                group: ['@/shared/lib/logger*', '**/shared/lib/logger*'],
                message: VERIFICATION_IMPORT_MESSAGE,
              },
            ],
          },
        ],
      },
    },
  ],
};
