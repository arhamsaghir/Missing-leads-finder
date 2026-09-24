import type { ReactNode } from 'react';
import { AuthProvider } from './auth/AuthProvider';

/**
 * The app's provider tree. Currently just auth session state.
 *
 * Extracted from main.tsx so tests wrap components in the same providers
 * production uses. When the Tamagui design system is adopted (pending
 * @tamagui/vite-plugin, which cannot be installed offline), its provider wraps
 * AuthProvider here.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
