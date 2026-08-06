import { Environment } from 'react-native-persona';

/**
 * P2-1.0: client-initiated inquiry config (Inquiry.fromTemplate). This is the
 * increment-1 shape — no backend dependency. A later increment (P2-8.0)
 * swaps this for a server-created inquiry ID plus webhook confirmation; see
 * docs/project-roadmap-todos/TODO-phase-2.md.
 *
 * Lazy so importing this module never throws; only calling
 * getPersonaConfig() without env vars set does — same pattern as
 * src/shared/lib/supabaseClient.ts's getSupabaseClient().
 */
export function getPersonaConfig(): { templateId: string; environment: Environment } {
  const templateId = process.env.PERSONA_TEMPLATE_ID;
  const environmentName = process.env.PERSONA_ENVIRONMENT ?? 'sandbox';

  if (!templateId) {
    throw new Error(
      'PERSONA_TEMPLATE_ID is not set. Configure it via env — see .env.example. ' +
        'Create a Government ID + Selfie template in your Persona dashboard first.',
    );
  }

  const environment = environmentName === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;

  return { templateId, environment };
}
