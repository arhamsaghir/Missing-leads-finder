import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test/render';

/**
 * App is the session gate. Auth is mocked so each test fixes the session state
 * it asserts on; the sign-in and dashboard children have their own tests.
 */
const useAuth = vi.fn();
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => useAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// The dashboard fetches on mount; stub it so the signed-in test does not hit the
// API client. The card/dashboard have dedicated tests.
vi.mock('./components/SourcesDashboard', () => ({
  SourcesDashboard: () => <div>Lead connections</div>,
}));

import App from './App';

afterEach(() => vi.clearAllMocks());

describe('App session gate', () => {
  it('shows the sign-in screen when there is no session', () => {
    useAuth.mockReturnValue({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() });
    renderWithProviders(<App />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows the connections dashboard when signed in', () => {
    useAuth.mockReturnValue({
      session: { access_token: 'jwt' },
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    renderWithProviders(<App />);
    expect(screen.getByText(/Missed Lead Revenue Finder/i)).toBeInTheDocument();
    expect(screen.getByText(/Lead connections/i)).toBeInTheDocument();
  });
});
