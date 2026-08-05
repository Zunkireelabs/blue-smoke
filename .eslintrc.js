const VERIFICATION_IMPORT_MESSAGE =
  'src/features/verification/** may not import logging, analytics, or persistence ' +
  'modules (CLAUDE.md rule 1 / spec §9.2): a crash during ID capture must not be ' +
  'capable of producing a report containing the ID.';

module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
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
                name: 'react-native-keychain',
                message: VERIFICATION_IMPORT_MESSAGE,
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
