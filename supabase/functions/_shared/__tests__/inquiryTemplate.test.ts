/**
 * Spec §6.6 item 3 — the min_age enforcement point.
 *
 * The property under test is one sentence: an inquiry that did not come from the template a
 * human confirmed enforces 18+ must never be able to mark somebody verified. Every case below
 * is a way that could go wrong, and every one of them must fail CLOSED.
 */
import {
  extractInquiryTemplateId,
  verifyInquiryTemplate,
} from '../inquiryTemplate';

/** The age-verifying template a human confirmed in the dashboard. */
const EXPECTED = 'itmpl_AgeVerifyingTemplate';
/** The identity-only template this project was actually pointed at until 2026-08-09. */
const IDENTITY_ONLY = 'itmpl_GovIdAndSelfieOnly';

function dynamicFlowInquiry(templateId: string) {
  return {
    id: 'inq_123',
    attributes: { status: 'approved' },
    relationships: { 'inquiry-template': { data: { id: templateId, type: 'inquiry-template' } } },
  };
}

function legacyInquiry(templateId: string) {
  return {
    id: 'inq_123',
    attributes: { status: 'approved' },
    relationships: { template: { data: { id: templateId, type: 'template' } } },
  };
}

describe('extractInquiryTemplateId', () => {
  it('reads the Dynamic Flow relationship (itmpl_ ids, what this project uses)', () => {
    expect(extractInquiryTemplateId(dynamicFlowInquiry(EXPECTED))).toBe(EXPECTED);
  });

  it('falls back to the Legacy 2.0 relationship key', () => {
    expect(extractInquiryTemplateId(legacyInquiry(EXPECTED))).toBe(EXPECTED);
  });

  it('prefers the Dynamic Flow key when a payload somehow carries both', () => {
    const both = {
      relationships: {
        'inquiry-template': { data: { id: EXPECTED } },
        template: { data: { id: IDENTITY_ONLY } },
      },
    };
    expect(extractInquiryTemplateId(both)).toBe(EXPECTED);
  });

  it.each([
    ['no relationships at all', { id: 'inq_123' }],
    ['relationships present but empty', { relationships: {} }],
    ['relationship present but no data', { relationships: { 'inquiry-template': {} } }],
    ['data present but no id', { relationships: { 'inquiry-template': { data: {} } } }],
    ['an empty-string id', { relationships: { 'inquiry-template': { data: { id: '' } } } }],
    ['null', null],
    ['undefined', undefined],
    ['a string where an object belongs', 'inq_123'],
  ])('returns null for %s', (_label, input) => {
    expect(extractInquiryTemplateId(input)).toBeNull();
  });

  it('does NOT coerce a non-string id — that would report a mismatch that is really an absence', () => {
    // String({}) is "[object Object]", which would compare unequal and so still fail closed —
    // but it would send someone hunting a template misconfiguration that does not exist.
    expect(extractInquiryTemplateId({ relationships: { 'inquiry-template': { data: { id: {} } } } }))
      .toBeNull();
    expect(extractInquiryTemplateId({ relationships: { 'inquiry-template': { data: { id: 42 } } } }))
      .toBeNull();
  });
});

describe('verifyInquiryTemplate', () => {
  it('confirms an inquiry from the expected template', () => {
    expect(
      verifyInquiryTemplate({
        inquiry: dynamicFlowInquiry(EXPECTED),
        expectedTemplateId: EXPECTED,
      }),
    ).toEqual({ confirmed: true, templateId: EXPECTED });
  });

  it('🔴 REFUSES an approved inquiry from the identity-only template — the §6.6 item 3 scenario', () => {
    // This is the exact live defect found on 2026-08-09: PERSONA_TEMPLATE_ID pointed at
    // "Government ID (with autoclassification) and Selfie", which verifies WHO someone is and
    // says nothing about their age. An `approved` from it must not open the gate.
    expect(
      verifyInquiryTemplate({
        inquiry: dynamicFlowInquiry(IDENTITY_ONLY),
        expectedTemplateId: EXPECTED,
      }),
    ).toEqual({ confirmed: false, reason: 'mismatch' });
  });

  it.each([undefined, null, '', '   '])(
    'fails closed when PERSONA_TEMPLATE_ID is unset or blank (%p) — never waves an inquiry through',
    (expectedTemplateId) => {
      expect(
        verifyInquiryTemplate({
          inquiry: dynamicFlowInquiry(EXPECTED),
          expectedTemplateId,
        }),
      ).toEqual({ confirmed: false, reason: 'not_configured' });
    },
  );

  it('fails closed when the delivery carries no template linkage', () => {
    expect(
      verifyInquiryTemplate({
        inquiry: { id: 'inq_123', attributes: { status: 'approved' } },
        expectedTemplateId: EXPECTED,
      }),
    ).toEqual({ confirmed: false, reason: 'absent_from_payload' });
  });

  it('tolerates surrounding whitespace in the configured id — a .env copy-paste artefact', () => {
    expect(
      verifyInquiryTemplate({
        inquiry: dynamicFlowInquiry(EXPECTED),
        expectedTemplateId: `  ${EXPECTED}  `,
      }),
    ).toEqual({ confirmed: true, templateId: EXPECTED });
  });

  it('is case-sensitive — Persona ids are, and a near-miss is a real mismatch', () => {
    expect(
      verifyInquiryTemplate({
        inquiry: dynamicFlowInquiry(EXPECTED.toLowerCase()),
        expectedTemplateId: EXPECTED,
      }),
    ).toEqual({ confirmed: false, reason: 'mismatch' });
  });

  it('never confirms on a partial/prefix match — a truncated id must not pass', () => {
    // The dashboard truncates ids in its table view (itmpl_AW8e9aVuRLU…). Pasting a truncated
    // value into .env must fail loudly rather than match by prefix.
    expect(
      verifyInquiryTemplate({
        inquiry: dynamicFlowInquiry(EXPECTED),
        expectedTemplateId: EXPECTED.slice(0, 12),
      }),
    ).toEqual({ confirmed: false, reason: 'mismatch' });
  });
});
