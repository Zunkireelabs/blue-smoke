// Four projects: the RN app, tools/mock-peripheral, supabase/functions, and
// tools/lint-guard — the latter three are plain Node with no RN runtime, each with its own
// jest.config.js explaining why it can't share the RN preset.
module.exports = {
  // Jest's workers never release a test file's module registry once loaded, so heap grows
  // monotonically as more suites land in the same worker. Locally (10 CPUs, ~9 workers) that
  // never surfaces — each worker only takes ~8 of the 76 suites. On the CI runner's 2-4 workers
  // it does: heap climbs past Node's default old-space ceiling well after the last test reports
  // passed, during worker teardown, crashing the job with an OOM `Aborted (core dumped)` even
  // though every test passed. This recycles a worker once its idle (between-file) memory crosses
  // the limit, before that accumulation gets anywhere near the ceiling.
  workerIdleMemoryLimit: '512MB',
  projects: [
    {
      displayName: 'app',
      preset: '@react-native/jest-preset',
      // The default preset only whitelists react-native/@react-native packages
      // for transformation; several of our deps ship untranspiled ESM and need
      // the same treatment.
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*|@noble/.*)/)',
      ],
      testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/tools/',
        '<rootDir>/supabase/',
      ],
      // 🔴 Never fake setImmediate. Node's parent<->worker IPC delivers messages through it, so
      // a suite that fakes it and then advances the clock consumes the IPC channel's own
      // immediate callbacks; the worker survives with a dead message channel and sits idle
      // forever waiting for a task the parent believes it already sent. Nothing recovers it —
      // the per-test timeout cannot fire, because that timer is faked too — so the job produces
      // no output and no failure. CI hung silently for up to 58 minutes per run on this.
      // Only serial runs are affected, which is why it reproduced every time on CI's 2-core
      // runner (maxWorkers=1) and never on a multi-core dev machine, where the following test
      // file lands in a different worker. Set here rather than in the one suite that tripped it
      // because 17 suites call useFakeTimers(), and the next one written would reintroduce it.
      // Tests may still fake everything else, timers and Date included.
      fakeTimers: { doNotFake: ['setImmediate', 'clearImmediate'] },
      // Fails the test that produced it on any unexpected console.error — see
      // docs/execution-briefs/UI-BUILD-E-console-error-guard.md.
      setupFilesAfterEnv: [require.resolve('./tools/jest/failOnConsoleError.js')],
    },
    '<rootDir>/tools/mock-peripheral/jest.config.js',
    '<rootDir>/supabase/functions/jest.config.js',
    '<rootDir>/tools/lint-guard/jest.config.js',
  ],
};
