/**
 * Minimal ambient declaration for the env vars this app reads via
 * process.env. Deliberately not `@types/node` — pulling the full Node
 * global surface (Buffer, NodeJS.Timeout, etc.) conflicts with React
 * Native's own timer/global types.
 */
declare const process: {
  env: {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
  };
};
