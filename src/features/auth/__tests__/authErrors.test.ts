import { GENERIC_AUTH_ERROR, toAuthUserMessage } from '../authErrors';

/**
 * The regression these exist for: on 2026-08-10 the phone form rendered Twilio's own error
 * verbatim, naming the vendor and linking our admin console. The property under test is not
 * "the right message appears" but "provider text never appears" — so the leak-shaped
 * assertions below matter more than the mapping ones.
 */
describe('toAuthUserMessage', () => {
  it('never returns provider text, even when the error carries a message field', () => {
    const twilio = {
      code: 'sms_send_failed',
      status: 500,
      message:
        'Error sending confirmation OTP to provider: The phone number is unverified. Trial ' +
        'accounts cannot send messages to unverified numbers; verify it at ' +
        'twilio.com/user/account/phone-numbers/verified More information: ' +
        'https://www.twilio.com/docs/errors/21608',
    };

    const shown = toAuthUserMessage(twilio);

    expect(shown).not.toContain('twilio');
    expect(shown).not.toContain('Twilio');
    expect(shown).not.toContain('Trial');
    expect(shown).not.toContain('http');
    expect(shown).not.toContain('provider');
    expect(shown).not.toBe(twilio.message);
    expect(shown).toBe("We couldn't send a code to that number. Check it's right, or try a different one.");
  });

  it('leaks nothing for an unrecognised code, however loud its message', () => {
    const shown = toAuthUserMessage({
      code: 'some_code_that_does_not_exist_yet',
      status: 400,
      message: 'SMTP host smtp.example-vendor.com rejected sender apikey-1234',
    } as never);

    expect(shown).toBe(GENERIC_AUTH_ERROR);
    expect(shown).not.toContain('smtp');
    expect(shown).not.toContain('apikey');
  });

  it('maps the rate limits a user can actually act on', () => {
    const waitMessage = 'Too many attempts just now. Wait a minute, then try again.';
    expect(toAuthUserMessage({ code: 'over_sms_send_rate_limit' })).toBe(waitMessage);
    expect(toAuthUserMessage({ code: 'over_email_send_rate_limit' })).toBe(waitMessage);
    expect(toAuthUserMessage({ code: 'over_request_rate_limit' })).toBe(waitMessage);
    // Unknown code, but the status still says "slow down".
    expect(toAuthUserMessage({ code: 'unknown', status: 429 })).toBe(waitMessage);
  });

  it('treats provider/config outages as ours, never explaining which switch is off', () => {
    const unavailable = "We can't do that right now. Please try again in a few minutes.";
    expect(toAuthUserMessage({ code: 'phone_provider_disabled' })).toBe(unavailable);
    expect(toAuthUserMessage({ code: 'signup_disabled' })).toBe(unavailable);
    expect(toAuthUserMessage({ code: 'unknown', status: 503 })).toBe(unavailable);
  });

  it('coaches the recoverable cases', () => {
    expect(toAuthUserMessage({ code: 'otp_expired' })).toBe('That code has expired. Ask for a new one.');
    expect(toAuthUserMessage({ code: 'weak_password' })).toBe(
      'Pick a longer password — mix in a few numbers or symbols.',
    );
    expect(toAuthUserMessage({ code: 'email_not_confirmed' })).toBe(
      'Confirm your email first — check your inbox for the link.',
    );
  });

  it('does not throw on the shapes a failure path can realistically hand it', () => {
    expect(toAuthUserMessage(null)).toBe(GENERIC_AUTH_ERROR);
    expect(toAuthUserMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
    expect(toAuthUserMessage({})).toBe(GENERIC_AUTH_ERROR);
    expect(toAuthUserMessage({ code: null, status: null })).toBe(GENERIC_AUTH_ERROR);
  });
});
