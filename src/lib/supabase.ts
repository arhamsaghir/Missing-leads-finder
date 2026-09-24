import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser Supabase client — the only thing in the web app that talks to
 * Supabase Auth.
 *
 * It exists solely to obtain and refresh a session JWT; every call to our own
 * API carries that JWT as a Bearer token (see `api.ts`). The anon key is safe to
 * ship: it is public by design and grants nothing without a policy, and this app
 * never reads tenant tables directly from the browser — the serverless API does,
 * behind RLS.
 *
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` come from the build-time env
 * (`.env`, mirrored in `.env.example`). A missing value throws here, at startup,
 * rather than surfacing later as an opaque 401 from a client with an empty key.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — the web app cannot sign in without them.',
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    // Persist the session and refresh it in the background, so a returning owner
    // is not bounced to the sign-in screen every time the access token expires.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
