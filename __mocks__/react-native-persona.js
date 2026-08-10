/**
 * Manual Jest mock for react-native-persona. The real module constructs a
 * NativeEventEmitter at import time (lib/commonjs/index.ts), which requires
 * a linked native module and throws under Jest/Node — there is no device.
 * P2-1.0 is the first native module actually reached by App.tsx's static
 * import chain, which is why this hasn't been needed before.
 */

const Environment = {
  SANDBOX: 'sandbox',
  PRODUCTION: 'production',
};

// P2-6.0 (UI-BUILD-B) addition: the real SDK invokes these callbacks from native code once the
// user interacts with (or the SDK itself resolves) the modal it launches — this mock's `start()`
// is a no-op, so nothing ever called them. `__lastHandlers` exposes the most recently registered
// set so a test can simulate the SDK calling back, e.g. `__lastHandlers().onCanceled()`, without
// every test file needing its own copy of this plumbing.
let lastHandlers = null;

class TemplateBuilder {
  constructor() {
    this.handlers = {};
  }
  environment() {
    return this;
  }
  referenceId() {
    return this;
  }
  fields() {
    return this;
  }
  onComplete(fn) {
    this.handlers.onComplete = fn;
    return this;
  }
  onCanceled(fn) {
    this.handlers.onCanceled = fn;
    return this;
  }
  onError(fn) {
    this.handlers.onError = fn;
    return this;
  }
  build() {
    lastHandlers = this.handlers;
    return { start: () => {} };
  }
}

const Inquiry = {
  fromTemplate: () => new TemplateBuilder(),
  fromTemplateVersion: () => new TemplateBuilder(),
  fromInquiry: () => new TemplateBuilder(),
};

function __lastHandlers() {
  return lastHandlers;
}

module.exports = { Environment, Inquiry, __lastHandlers };
