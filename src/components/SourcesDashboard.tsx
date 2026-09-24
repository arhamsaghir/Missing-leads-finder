import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, sources, type SourceResponse } from '../lib/api';
import { ConnectionCard } from './ConnectionCard';

/**
 * The connection dashboard: every lead source with its live status, plus a way
 * to add one.
 *
 * After any mutation (create/rotate/revoke) it re-fetches the full list rather
 * than patching state in place, so the counts and `previousTokenInUse` a card
 * shows always come from the server that owns them — the client never guesses at
 * derived status. Plain HTML/CSS (styles in styles.css).
 */
export function SourcesDashboard() {
  const [list, setList] = useState<SourceResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setList(await sources.list());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your connections.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      await sources.create(trimmed);
      setLabel('');
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the connection.');
    } finally {
      setCreating(false);
    }
  }

  const onRotate = useCallback(
    async (id: string) => {
      await sources.rotate(id);
      await refresh();
    },
    [refresh],
  );

  const onRevoke = useCallback(
    async (id: string) => {
      await sources.revoke(id);
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="sources-dash">
      <h2 className="sources-title">Lead connections</h2>

      <form onSubmit={onCreate} className="sources-create">
        <input
          aria-label="New connection label"
          placeholder="e.g. Website contact form"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" disabled={creating || label.trim() === ''}>
          {creating ? 'Adding…' : 'Add connection'}
        </button>
      </form>

      {error && (
        <p className="conn-error" role="alert">
          {error}
        </p>
      )}

      {list === null && !error && <p className="conn-muted">Loading…</p>}

      {list !== null && list.length === 0 && (
        <p className="conn-muted">
          No connections yet. Add one above, then paste its URL into your form tool.
        </p>
      )}

      {list?.map((s) => (
        <ConnectionCard key={s.id} source={s} onRotate={onRotate} onRevoke={onRevoke} />
      ))}
    </div>
  );
}
