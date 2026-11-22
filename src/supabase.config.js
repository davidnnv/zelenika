// Supabase settings come from environment variables only (never hard-coded):
//   local: .env (copy .env.example)   ·   Render: Environment → VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// The anon key is a public key by design — what it can do is limited by the database rules
// (supabase/schema.sql + security.sql). The service_role key must NEVER be used in this app.
export const SUPABASE = {
  url: import.meta.env.VITE_SUPABASE_URL || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};
