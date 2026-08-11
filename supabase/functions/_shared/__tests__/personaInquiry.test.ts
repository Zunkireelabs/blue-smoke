/**
 * Brief §3–§5 — request-building and response-parsing for Persona's `POST /inquiries`.
 *
 * The property under test: `Persona-Version` and `Key-Inflection` are always sent explicitly
 * (never left to the key's dashboard defaults), `reference-id` is never sent, and every
 * non-201 outcome gets a distinct, non-guessed verdict — no catch-all swallowing a shape
 * change into a silent "worked".
 */
import {
  INQUIRY_ID_UNIQUE_CONSTRAINT,
  PERSONA_API_VERSION,
  PERSONA_INQUIRIES_URL,
  buildCreateInquiryRequest,
  buildIdempotencyKey,
  buildResumeInquiryRequest,
  isConcurrentInquiryInsertRace,
  parseCreateInquiryResponse,
  parseResumeInquiryResponse,
} from '../personaInquiry';

describe('buildCreateInquiryRequest', () => {
  const request = buildCreateInquiryRequest({
    apiKey: 'api_test_key',
    templateId: 'itmpl_AgeVerifyingTemplate',
    idempotencyKey: 'create-inquiry:user-1:0',
  });

  it('posts to the documented Persona endpoint', () => {
    expect(request.method).toBe('POST');
    expect(request.url).toBe(PERSONA_INQUIRIES_URL);
  });

  it('sends the API key as a bearer token', () => {
    expect(request.headers.Authorization).toBe('Bearer api_test_key');
  });

  it('pins Persona-Version explicitly rather than relying on the key default', () => {
    expect(request.headers['Persona-Version']).toBe('2025-12-08');
    expect(PERSONA_API_VERSION).toBe('2025-12-08');
  });

  it('pins Key-Inflection to kebab explicitly', () => {
    expect(request.headers['Key-Inflection']).toBe('kebab');
  });

  it('forwards the caller-derived Idempotency-Key verbatim', () => {
    expect(request.headers['Idempotency-Key']).toBe('create-inquiry:user-1:0');
  });

  it('sends the template id and asks Persona to issue a session token — no reference-id (brief §4.1)', () => {
    const body = JSON.parse(request.body);
    expect(body).toEqual({
      data: { attributes: { 'inquiry-template-id': 'itmpl_AgeVerifyingTemplate' } },
      meta: { 'auto-create-inquiry-session': true },
    });
    expect(request.body).not.toContain('reference-id');
  });

  it('does not ask for a one-time-link — hosted flow is unused (brief §3)', () => {
    const body = JSON.parse(request.body);
    expect(body.meta).not.toHaveProperty('auto-create-one-time-link');
  });
});

describe('buildIdempotencyKey', () => {
  it('is not the bare user_id (brief §4.3)', () => {
    const key = buildIdempotencyKey('user-1', 0);
    expect(key).not.toBe('user-1');
  });

  it('is identical for two concurrent requests at the same attempt number', () => {
    expect(buildIdempotencyKey('user-1', 2)).toBe(buildIdempotencyKey('user-1', 2));
  });

  it('differs across attempt numbers for the same user — a fresh attempt must not reuse a stale key', () => {
    expect(buildIdempotencyKey('user-1', 0)).not.toBe(buildIdempotencyKey('user-1', 1));
  });

  it('differs across users at the same attempt number', () => {
    expect(buildIdempotencyKey('user-1', 0)).not.toBe(buildIdempotencyKey('user-2', 0));
  });
});

describe('parseCreateInquiryResponse', () => {
  const VALID_201_BODY = JSON.stringify({
    data: { id: 'inq_abc123', type: 'inquiry' },
    meta: { 'session-token': 'sess_xyz789' },
  });

  it('parses a valid 201 into inquiryId + sessionToken', () => {
    const outcome = parseCreateInquiryResponse({ status: 201, rawBody: VALID_201_BODY });
    expect(outcome).toEqual({ ok: true, inquiryId: 'inq_abc123', sessionToken: 'sess_xyz789' });
  });

  it('reads the literal kebab key, not a camelCase fallback — Key-Inflection drift must fail, not silently coerce', () => {
    const camelBody = JSON.stringify({
      data: { id: 'inq_abc123' },
      meta: { sessionToken: 'sess_xyz789' },
    });
    const outcome = parseCreateInquiryResponse({ status: 201, rawBody: camelBody });
    expect(outcome).toEqual({
      ok: false,
      kind: 'missing_session_token',
      detail: expect.any(String),
    });
  });

  it('401 → unauthenticated', () => {
    expect(parseCreateInquiryResponse({ status: 401, rawBody: '' })).toEqual({
      ok: false,
      kind: 'unauthenticated',
      detail: expect.any(String),
    });
  });

  it('403 → forbidden (the likely first-run failure — brief §2)', () => {
    expect(parseCreateInquiryResponse({ status: 403, rawBody: '' })).toEqual({
      ok: false,
      kind: 'forbidden',
      detail: expect.any(String),
    });
  });

  it('422 → unprocessable', () => {
    expect(parseCreateInquiryResponse({ status: 422, rawBody: '' })).toEqual({
      ok: false,
      kind: 'unprocessable',
      detail: expect.any(String),
    });
  });

  it('429 → rate_limited, surfacing RateLimit-Reset when present', () => {
    expect(
      parseCreateInquiryResponse({ status: 429, rawBody: '', rateLimitReset: '1770000060' }),
    ).toEqual({
      ok: false,
      kind: 'rate_limited',
      detail: expect.any(String),
      retryAfterSeconds: 1_770_000_060,
    });
  });

  it('429 → rate_limited without a retryAfterSeconds when the header is absent', () => {
    const outcome = parseCreateInquiryResponse({ status: 429, rawBody: '' });
    expect(outcome).toEqual({ ok: false, kind: 'rate_limited', detail: expect.any(String) });
    expect(outcome).not.toHaveProperty('retryAfterSeconds');
  });

  it('an unexpected status (e.g. 500) → unexpected, not a silent pass-through', () => {
    expect(parseCreateInquiryResponse({ status: 500, rawBody: 'Internal Server Error' })).toEqual({
      ok: false,
      kind: 'unexpected',
      detail: expect.any(String),
    });
  });

  it('a 201 with an empty body → malformed_response', () => {
    expect(parseCreateInquiryResponse({ status: 201, rawBody: '' })).toEqual({
      ok: false,
      kind: 'malformed_response',
      detail: expect.any(String),
    });
  });

  it('a 201 with non-JSON garbage → malformed_response, never throws', () => {
    expect(() => parseCreateInquiryResponse({ status: 201, rawBody: '{not json' })).not.toThrow();
    expect(parseCreateInquiryResponse({ status: 201, rawBody: '{not json' })).toEqual({
      ok: false,
      kind: 'malformed_response',
      detail: expect.any(String),
    });
  });

  it('a 201 missing data.id → malformed_response', () => {
    const body = JSON.stringify({ meta: { 'session-token': 'sess_xyz789' } });
    expect(parseCreateInquiryResponse({ status: 201, rawBody: body })).toEqual({
      ok: false,
      kind: 'malformed_response',
      detail: expect.any(String),
    });
  });

  it('a 201 missing meta.session-token → missing_session_token, fails loudly rather than stranding the app', () => {
    const body = JSON.stringify({ data: { id: 'inq_abc123' } });
    expect(parseCreateInquiryResponse({ status: 201, rawBody: body })).toEqual({
      ok: false,
      kind: 'missing_session_token',
      detail: expect.any(String),
    });
  });

  it('a 201 with an empty-string session-token → missing_session_token', () => {
    const body = JSON.stringify({ data: { id: 'inq_abc123' }, meta: { 'session-token': '' } });
    expect(parseCreateInquiryResponse({ status: 201, rawBody: body })).toEqual({
      ok: false,
      kind: 'missing_session_token',
      detail: expect.any(String),
    });
  });
});

describe('buildResumeInquiryRequest', () => {
  const request = buildResumeInquiryRequest({
    apiKey: 'api_test_key',
    inquiryId: 'inq_abc123',
  });

  it('posts to the documented resume endpoint for the given inquiry', () => {
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`${PERSONA_INQUIRIES_URL}/inq_abc123/resume`);
  });

  it('sends the API key as a bearer token', () => {
    expect(request.headers.Authorization).toBe('Bearer api_test_key');
  });

  it('pins Persona-Version explicitly rather than relying on the key default', () => {
    expect(request.headers['Persona-Version']).toBe('2025-12-08');
    expect(PERSONA_API_VERSION).toBe('2025-12-08');
  });

  it('pins Key-Inflection to kebab explicitly', () => {
    expect(request.headers['Key-Inflection']).toBe('kebab');
  });

  it('sends no Idempotency-Key — resume is not the operation that key deduplicates', () => {
    expect(request.headers).not.toHaveProperty('Idempotency-Key');
  });
});

describe('parseResumeInquiryResponse', () => {
  const VALID_BODY = JSON.stringify({
    data: { id: 'inq_abc123', type: 'inquiry' },
    meta: { 'session-token': 'sess_resumed789' },
  });

  it('parses a valid 200 into inquiryId + sessionToken', () => {
    const outcome = parseResumeInquiryResponse({ status: 200, rawBody: VALID_BODY });
    expect(outcome).toEqual({ ok: true, inquiryId: 'inq_abc123', sessionToken: 'sess_resumed789' });
  });

  it('parses a valid 201 into inquiryId + sessionToken', () => {
    const outcome = parseResumeInquiryResponse({ status: 201, rawBody: VALID_BODY });
    expect(outcome).toEqual({ ok: true, inquiryId: 'inq_abc123', sessionToken: 'sess_resumed789' });
  });

  it('reads the literal kebab key, not a camelCase fallback', () => {
    const camelBody = JSON.stringify({
      data: { id: 'inq_abc123' },
      meta: { sessionToken: 'sess_resumed789' },
    });
    expect(parseResumeInquiryResponse({ status: 200, rawBody: camelBody })).toEqual({
      ok: false,
      kind: 'missing_session_token',
      detail: expect.any(String),
    });
  });

  it('401 → unauthenticated', () => {
    expect(parseResumeInquiryResponse({ status: 401, rawBody: '' })).toEqual({
      ok: false,
      kind: 'unauthenticated',
      detail: expect.any(String),
    });
  });

  it('403 → forbidden', () => {
    expect(parseResumeInquiryResponse({ status: 403, rawBody: '' })).toEqual({
      ok: false,
      kind: 'forbidden',
      detail: expect.any(String),
    });
  });

  it('422 → unprocessable', () => {
    expect(parseResumeInquiryResponse({ status: 422, rawBody: '' })).toEqual({
      ok: false,
      kind: 'unprocessable',
      detail: expect.any(String),
    });
  });

  it('429 → rate_limited, surfacing RateLimit-Reset when present', () => {
    expect(
      parseResumeInquiryResponse({ status: 429, rawBody: '', rateLimitReset: '1770000060' }),
    ).toEqual({
      ok: false,
      kind: 'rate_limited',
      detail: expect.any(String),
      retryAfterSeconds: 1_770_000_060,
    });
  });

  it('429 → rate_limited without a retryAfterSeconds when the header is absent', () => {
    const outcome = parseResumeInquiryResponse({ status: 429, rawBody: '' });
    expect(outcome).toEqual({ ok: false, kind: 'rate_limited', detail: expect.any(String) });
    expect(outcome).not.toHaveProperty('retryAfterSeconds');
  });

  it('an unexpected status (e.g. 404) → unexpected, not a silent pass-through', () => {
    expect(parseResumeInquiryResponse({ status: 404, rawBody: 'Not Found' })).toEqual({
      ok: false,
      kind: 'unexpected',
      detail: expect.any(String),
    });
  });

  it('a 200 with an empty body → malformed_response', () => {
    expect(parseResumeInquiryResponse({ status: 200, rawBody: '' })).toEqual({
      ok: false,
      kind: 'malformed_response',
      detail: expect.any(String),
    });
  });

  it('a 200 with non-JSON garbage → malformed_response, never throws', () => {
    expect(() => parseResumeInquiryResponse({ status: 200, rawBody: '{not json' })).not.toThrow();
    expect(parseResumeInquiryResponse({ status: 200, rawBody: '{not json' })).toEqual({
      ok: false,
      kind: 'malformed_response',
      detail: expect.any(String),
    });
  });

  it('a 200 missing data.id → malformed_response', () => {
    const body = JSON.stringify({ meta: { 'session-token': 'sess_resumed789' } });
    expect(parseResumeInquiryResponse({ status: 200, rawBody: body })).toEqual({
      ok: false,
      kind: 'malformed_response',
      detail: expect.any(String),
    });
  });

  it('a 200 missing meta.session-token → missing_session_token, fails loudly rather than stranding the app', () => {
    const body = JSON.stringify({ data: { id: 'inq_abc123' } });
    expect(parseResumeInquiryResponse({ status: 200, rawBody: body })).toEqual({
      ok: false,
      kind: 'missing_session_token',
      detail: expect.any(String),
    });
  });

  it('a 200 with an empty-string session-token → missing_session_token', () => {
    const body = JSON.stringify({ data: { id: 'inq_abc123' }, meta: { 'session-token': '' } });
    expect(parseResumeInquiryResponse({ status: 200, rawBody: body })).toEqual({
      ok: false,
      kind: 'missing_session_token',
      detail: expect.any(String),
    });
  });
});

/**
 * Brief follow-up §4.3 — the loser of the concurrent-insert race. Two requests that share an
 * Idempotency-Key get the SAME Persona inquiry back, but both still race to INSERT the pending
 * row; only one wins against `verifications_inquiry_id_key`. This is what tells the caller that
 * an insert failure is exactly that race, safe to answer as a success, rather than any other
 * insert failure, which must keep failing.
 */
describe('isConcurrentInquiryInsertRace', () => {
  it('recognizes the inquiry_id unique-violation shape Postgres actually sends', () => {
    expect(
      isConcurrentInquiryInsertRace({
        code: '23505',
        message: `duplicate key value violates unique constraint "${INQUIRY_ID_UNIQUE_CONSTRAINT}"`,
      }),
    ).toBe(true);
  });

  it('is false for a unique violation on a DIFFERENT constraint — not every 23505 is this race', () => {
    expect(
      isConcurrentInquiryInsertRace({
        code: '23505',
        message: 'duplicate key value violates unique constraint "verifications_pkey"',
      }),
    ).toBe(false);
  });

  it('is false for a non-unique-violation error, even with a matching message', () => {
    expect(
      isConcurrentInquiryInsertRace({
        code: '23503',
        message: `duplicate key value violates unique constraint "${INQUIRY_ID_UNIQUE_CONSTRAINT}"`,
      }),
    ).toBe(false);
  });

  it('is false for a unique-violation code with no message', () => {
    expect(isConcurrentInquiryInsertRace({ code: '23505' })).toBe(false);
    expect(isConcurrentInquiryInsertRace({ code: '23505', message: null })).toBe(false);
  });

  it('is false for null/undefined — a missing error must never be read as a race', () => {
    expect(isConcurrentInquiryInsertRace(null)).toBe(false);
    expect(isConcurrentInquiryInsertRace(undefined)).toBe(false);
  });
});
