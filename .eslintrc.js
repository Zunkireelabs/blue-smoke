// A no-network ESLint guard used to live here, scoped to
// src/features/verification/**. It was written for the on-device design,
// where raw ID/selfie frames crossed into JS and had to be stopped from
// leaving the device. P2-1.0 replaced that design with Persona's SDK, which
// captures and uploads the ID/selfie itself — our code never receives the
// raw image, DOB, or a biometric embedding, so there's nothing left in that
// subtree for the guard to protect. See CLAUDE.md's "verification" rules and
// docs/project-roadmap-todos/TODO-phase-2.md.
module.exports = {
  root: true,
  extends: '@react-native',
};
