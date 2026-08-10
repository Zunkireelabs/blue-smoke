/**
 * Inquiry-template verification — spec §6.6 items 2 and 3, the `min_age` enforcement point.
 *
 * Pure and runtime-agnostic (no Deno imports), same split as `personaSignature.ts` versus
 * `persona-webhook/index.ts`.
 *
 * ── Why this module exists ─────────────────────────────────────────────────────────────
 *
 * §6.6 item 3 states the problem exactly: a Persona status of `completed`/`approved` means
 * *"the inquiry passed the checks the template was configured with"* — **not** *"this person is
 * over 18"*. A template that scans a government ID and matches a selfie but carries no age
 * requirement returns `approved` for a fourteen-year-old, and every server-side control we have
 * functions perfectly while the gate opens.
 *
 * Until now the spec concluded that "no code in this repo can detect that", and both §6.6 and
 * `create-inquiry/index.ts` said so. That is true of the *age requirement itself* — a checkbox
 * inside the vendor's dashboard, invisible from here. It is **not** true of **which template
 * answered**, which the webhook payload carries. So the checkable half is now checked:
 *
 *   - a human confirms, once, in the dashboard, that template X enforces 18+;
 *   - `PERSONA_TEMPLATE_ID` names X, and `create-inquiry` opens inquiries against X;
 *   - this module refuses to let an inquiry from anything that is not X mark a user verified.
 *
 * That converts "the age gate rests on a dashboard checkbox nobody can verify" into "the age
 * gate rests on a dashboard checkbox **that was verified once**, pinned to an id, and enforced
 * on every single decision". It does not remove the need for the dashboard screenshot — it
 * removes the ability for the configuration to drift away from it silently afterwards.
 *
 * ── The payload path ───────────────────────────────────────────────────────────────────
 *
 * Persona references the template through the inquiry's `relationships`, and the key depends on
 * the template generation: `inquiry-template` for a Dynamic Flow inquiry (template ids prefixed
 * `itmpl_`, which is what this project uses), and `template` for a Legacy 2.0 inquiry. Both are
 * read, newest first, so this keeps working if the account is ever migrated.
 *
 * ⚠️ Persona's webhook config controls which related objects are expanded into the event's
 * `included` array. This module reads the `relationships` LINKAGE, not `included`, precisely
 * because linkage does not depend on that setting — but if a delivery ever arrives with no
 * relationship at all, `absent_from_payload` is the verdict and the caller must fail closed.
 * A missing path must never be read as "probably fine".
 */

/** The relationship keys Persona uses for the template, newest generation first. */
const TEMPLATE_RELATIONSHIP_KEYS = ['inquiry-template', 'template'] as const;

export type TemplateVerdict =
  | { confirmed: true; templateId: string }
  /**
   * Every failure is distinct, because they need different human responses:
   *   `not_configured`     — our deployment is missing PERSONA_TEMPLATE_ID. Ours to fix.
   *   `absent_from_payload`— the delivery carried no template linkage. Vendor/payload shape.
   *   `mismatch`           — a real inquiry from the WRONG template. The §6.6 item 3 scenario.
   */
  | { confirmed: false; reason: 'not_configured' | 'absent_from_payload' | 'mismatch' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Pulls the template id out of an inquiry resource, or null if it carries none.
 *
 * Deliberately tolerant about SHAPE (any key missing simply yields null) and completely
 * intolerant about TYPE: a non-string id is not coerced. `String(someObject)` here would
 * produce "[object Object]", which compares unequal to the expected id and would therefore
 * still fail closed — but it would report `mismatch` and send someone hunting a configuration
 * error that does not exist, instead of `absent_from_payload`.
 */
export function extractInquiryTemplateId(inquiry: unknown): string | null {
  const relationships = asRecord(asRecord(inquiry)?.relationships);
  if (!relationships) {
    return null;
  }

  for (const key of TEMPLATE_RELATIONSHIP_KEYS) {
    const id = asRecord(asRecord(relationships[key])?.data)?.id;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }

  return null;
}

/**
 * The decision itself. Returns a verdict rather than a boolean so the caller can log *which*
 * failure happened without re-deriving it — the three cases have genuinely different fixes.
 *
 * Comparison is an ordinary exact string equality: a template id is a public identifier, not a
 * secret, so there is nothing here for a timing attack to learn.
 */
export function verifyInquiryTemplate(args: {
  inquiry: unknown;
  expectedTemplateId: string | null | undefined;
}): TemplateVerdict {
  const expected = args.expectedTemplateId?.trim();
  if (!expected) {
    // No configured expectation means we cannot make the guarantee at all. Fail closed: an
    // unset variable must never be the thing that waves an inquiry through.
    return { confirmed: false, reason: 'not_configured' };
  }

  const actual = extractInquiryTemplateId(args.inquiry);
  if (!actual) {
    return { confirmed: false, reason: 'absent_from_payload' };
  }

  return actual === expected
    ? { confirmed: true, templateId: actual }
    : { confirmed: false, reason: 'mismatch' };
}
