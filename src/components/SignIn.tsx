import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';

/**
 * Email/password sign-in.
 *
 * Sign-up is deliberately absent this phase: creating an account also needs a
 * `customers` row provisioned for the new auth user, which is its own onboarding
 * work. Accounts are seeded (admin API) until then. Plain HTML/CSS (styles in
 * styles.css); the Tamagui design system is deferred until it can be bundled.
 */
export function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      // Success path is handled by onAuthStateChange lifting the session; this
      // component unmounts as the app switches to the dashboard.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setSubmitting(false);
    }
  }

  return (
    <div className="signin-screen">
      <main className="signin-card">
        <h1 className="signin-title">Sign in</h1>
        <p className="conn-muted">Manage your lead connections.</p>

        <form onSubmit={onSubmit} className="signin-form">
          <label className="signin-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="signin-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <p className="conn-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="signin-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
