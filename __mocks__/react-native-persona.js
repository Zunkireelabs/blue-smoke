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

class TemplateBuilder {
  environment() {
    return this;
  }
  referenceId() {
    return this;
  }
  fields() {
    return this;
  }
  onComplete() {
    return this;
  }
  onCanceled() {
    return this;
  }
  onError() {
    return this;
  }
  build() {
    return { start: () => {} };
  }
}

const Inquiry = {
  fromTemplate: () => new TemplateBuilder(),
  fromTemplateVersion: () => new TemplateBuilder(),
  fromInquiry: () => new TemplateBuilder(),
};

module.exports = { Environment, Inquiry };
