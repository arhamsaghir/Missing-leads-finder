/// <reference types="vite/client" />

/**
 * Typed access to the web app's build-time env. Vite exposes only `VITE_`-
 * prefixed vars to the client (`import.meta.env`); these are the ones this app
 * reads. `VITE_API_BASE_URL` is optional — same-origin `/api` when unset.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
