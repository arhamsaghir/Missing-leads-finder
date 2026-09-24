import { useState } from 'react';
import { useAuth } from './auth/AuthProvider';
import { SignIn } from './components/SignIn';
import { SourcesDashboard } from './components/SourcesDashboard';
import { CsvAnalyzer } from './components/CsvAnalyzer';
import './styles.css';

/**
 * The app shell and session gate.
 *
 * No router: the app has two states — signed out and signed in — so a
 * session-driven conditional render is simpler and lighter than pulling in a
 * routing library. Signed in, the owner gets the live connections dashboard
 * (the Phase 2b value) with the v1 CSV analyzer still reachable as backfill.
 */
function App() {
  const { session, loading, signOut } = useAuth();
  const [view, setView] = useState<'connections' | 'csv'>('connections');

  if (loading) {
    return (
      <div className="app">
        <main className="app-main">
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  if (!session) return <SignIn />;

  return (
    <div className="app">
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Missed Lead Revenue Finder</h1>
        <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setView('connections')} disabled={view === 'connections'}>
            Connections
          </button>
          <button onClick={() => setView('csv')} disabled={view === 'csv'}>
            CSV analyzer
          </button>
          <button onClick={() => void signOut()}>Sign out</button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'connections' ? <SourcesDashboard /> : <CsvAnalyzer />}
      </main>
    </div>
  );
}

export default App;
