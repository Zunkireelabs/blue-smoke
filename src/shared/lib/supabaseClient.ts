import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client — spec §9.1, §10.1. Config comes from env; nothing here is
 * ever a committed key. Real env injection (react-native-config / a babel
 * env plugin, per environment) is wired in P0-5.0 — until then this reads
 * process.env directly. Lazy so importing this module never throws; only
 * calling getSupabaseClient() without config does.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) {
    return client;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY are not set. Configure them via env ' +
        '(spec §10.1). Never commit the service-role key — it bypasses every RLS policy.',
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}
