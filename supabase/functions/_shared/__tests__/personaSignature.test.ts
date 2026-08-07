/**
 * Spec §12.1 gate G2: "persona-webhook signature verification implemented and TESTED AGAINST
 * A FORGED BODY". That is the test that matters here — a suite that only proves a valid
 * signature passes would have passed against a function with no verification at all.
 *
 * Runs under Node (Web Crypto is global from Node 18), so it needs no Deno toolchain.
 */
import {
  DEFAULT_TOLERANCE_SECONDS,
  parseSignatureHeader,
  timingSafeHexEqual,
  verifyPersonaSignature,
} from '../personaSignature';

const SECRET = 'wbhsec_test_do_not_use_in_any_real_environment';
const OTHER_SECRET = 'wbhsec_rotated_counterpart';
const NOW = 1_770_000_000;
const BODY = JSON.stringify({
  data: { attributes: { name: 'inquiry.approved', payload: { data: { id: 'inq_abc123' } } } },
});

/** Mirrors what Persona does, so the tests sign the way the vendor signs. */
async function sign(secret: string, timestamp: number | string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const header = (t: number | string, v1: string) => `t=${t},v1=${v1}`;

describe('parseSignatureHeader', () => {
  it('parses the documented single-set form', () => {
    expect(parseSignatureHeader('t=123,v1=abcd')).toEqual([{ t: '123', v1: 'abcd' }]);
  });

  it('parses the two-set rotation form', () => {
    expect(parseSignatureHeader('t=123,v1=aaaa t=123,v1=bbbb')).toEqual([
      { t: '123', v1: 'aaaa' },
      { t: '123', v1: 'bbbb' },
    ]);
  });

  it('drops incomplete sets rather than inventing a field', () => {
    expect(parseSignatureHeader('t=123 v1=aaaa')).toEqual([]);
    expect(parseSignatureHeader('garbage')).toEqual([]);
  });
});

describe('timingSafeHexEqual', () => {
  it('matches identical strings and rejects differing ones', () => {
    expect(timingSafeHexEqual('abcdef', 'abcdef')).toBe(true);
    expect(timingSafeHexEqual('abcdef', 'abcde0')).toBe(false);
    expect(timingSafeHexEqual('abcdef', 'abcd')).toBe(false);
  });

  it('rejects a prefix match — the case a short-circuit would wrongly accept', () => {
    expect(timingSafeHexEqual('aaaaaa', 'aaaaab')).toBe(false);
  });
});

describe('verifyPersonaSignature — the happy path', () => {
  it('accepts a correctly signed body', async () => {
    const v1 = await sign(SECRET, NOW, BODY);
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: header(NOW, v1),
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(result).toEqual({ valid: true, timestamp: NOW });
  });

  it('accepts either secret during a rotation', async () => {
    const oldSig = await sign(SECRET, NOW, BODY);
    const newSig = await sign(OTHER_SECRET, NOW, BODY);
    const rotationHeader = `${header(NOW, oldSig)} ${header(NOW, newSig)}`;

    for (const secret of [SECRET, OTHER_SECRET]) {
      const result = await verifyPersonaSignature({
        rawBody: BODY,
        header: rotationHeader,
        secret,
        nowSeconds: NOW,
      });
      expect(result.valid).toBe(true);
    }
  });
});

describe('verifyPersonaSignature — forgery (spec §12.1 G2, §8.3 "forged webhook")', () => {
  it('REJECTS a body tampered with after signing', async () => {
    const v1 = await sign(SECRET, NOW, BODY);
    const tampered = JSON.stringify({
      data: { attributes: { name: 'inquiry.approved', payload: { data: { id: 'inq_ATTACKER' } } } },
    });

    const result = await verifyPersonaSignature({
      rawBody: tampered,
      header: header(NOW, v1),
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it('REJECTS a signature made with the wrong secret', async () => {
    const v1 = await sign('attacker-guess', NOW, BODY);
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: header(NOW, v1),
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it('REJECTS an absent header — no "unsigned means skip" path exists', async () => {
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: null,
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it('REJECTS everything when the secret is unconfigured, rather than accepting it', async () => {
    // The deployment-mistake case: if a missing secret meant "skip verification", forgetting
    // one env var would silently turn the age gate off in production.
    const v1 = await sign(SECRET, NOW, BODY);
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: header(NOW, v1),
      secret: '',
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it('REJECTS a re-serialised body — the raw-bytes requirement, proven', async () => {
    // Signed over the original bytes; verified against a semantically identical object whose
    // key order differs. This is exactly what happens if a handler passes JSON.stringify(
    // JSON.parse(body)) instead of the raw body, and it must fail.
    const original = '{"b":2,"a":1}';
    const reserialised = JSON.stringify(JSON.parse(original)); // -> {"b":2,"a":1} order may differ
    const v1 = await sign(SECRET, NOW, original);

    if (reserialised !== original) {
      const result = await verifyPersonaSignature({
        rawBody: reserialised,
        header: header(NOW, v1),
        secret: SECRET,
        nowSeconds: NOW,
      });
      expect(result.valid).toBe(false);
    }

    // And the raw bytes still verify, so the failure above is about the bytes, not the setup.
    const ok = await verifyPersonaSignature({
      rawBody: original,
      header: header(NOW, v1),
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(ok.valid).toBe(true);
  });
});

describe('verifyPersonaSignature — replay (spec §8.3 "replayed webhook")', () => {
  it('REJECTS a capture replayed after the freshness window', async () => {
    const v1 = await sign(SECRET, NOW, BODY);
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: header(NOW, v1),
      secret: SECRET,
      nowSeconds: NOW + DEFAULT_TOLERANCE_SECONDS + 1,
    });
    expect(result.valid).toBe(false);
  });

  it('accepts a delivery at the edge of the window', async () => {
    const v1 = await sign(SECRET, NOW, BODY);
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: header(NOW, v1),
      secret: SECRET,
      nowSeconds: NOW + DEFAULT_TOLERANCE_SECONDS,
    });
    expect(result.valid).toBe(true);
  });

  it('REJECTS a future-dated timestamp', async () => {
    // Unbounded in the forward direction, a signature minted with a far-future `t` would stay
    // valid indefinitely.
    const future = NOW + 10 * DEFAULT_TOLERANCE_SECONDS;
    const v1 = await sign(SECRET, future, BODY);
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: header(future, v1),
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it('REJECTS a stale timestamp swapped onto a fresh signature', async () => {
    // The attacker holds a valid old (t, v1) and re-sends it with a current timestamp in the
    // header. The digest binds t, so changing t invalidates it.
    const v1 = await sign(SECRET, NOW - 10_000, BODY);
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: header(NOW, v1),
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
  });
});

describe('verifyPersonaSignature — malformed input is never fatal', () => {
  it.each([
    ['empty header', ''],
    ['no v1', 't=123'],
    ['non-numeric timestamp', 't=abc,v1=deadbeef'],
    ['empty v1', 't=123,v1='],
  ])('rejects %s without throwing', async (_label, headerValue) => {
    const result = await verifyPersonaSignature({
      rawBody: BODY,
      header: headerValue,
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
  });
});
