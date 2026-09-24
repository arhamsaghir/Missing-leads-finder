import { useState } from 'react';
import { ApiError, type SourceResponse } from '../lib/api';

/**
 * The owner-facing status of one lead source — the Phase 2b deliverable.
 *
 * Shows the webhook URL to paste, whether leads are arriving, and the two
 * conditions an owner must act on: the old URL still receiving traffic after a
 * rotation (`previousTokenInUse`), and a recent delivery we could not fully parse
 * (`lastParseWarningAt`).
 *
 * Plain HTML/CSS (styles in styles.css), matching the v1 screen. The shared
 * Tamagui design system is deferred until @tamagui/vite-plugin can be installed —
 * its production bundling needs that plugin, which is unavailable offline.
 */

interface Props {
  source: SourceResponse;
  onRotate: (id: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}

type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

function statusOf(s: SourceResponse): { tone: StatusTone; label: string } {
  if (s.revokedAt) return { tone: 'error', label: 'Revoked' };
  if (s.previousTokenInUse) return { tone: 'warning', label: 'Old URL still in use' };
  if (s.eventCount > 0) return { tone: 'success', label: 'Receiving leads' };
  return { tone: 'neutral', label: 'Waiting for first lead' };
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString();
}

export function ConnectionCard({ source, onRotate, onRevoke }: Props) {
  const [busy, setBusy] = useState<null | 'rotate' | 'revoke' | 'copy'>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = statusOf(source);
  const revoked = source.revokedAt !== null;

  async function run(action: 'rotate' | 'revoke', fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl() {
    if (!source.webhookUrl) return;
    setBusy('copy');
    try {
      await navigator.clipboard?.writeText(source.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure context): the URL is visible on
      // screen to copy by hand, so this is not an error worth interrupting for.
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="conn-card">
      <div className="conn-card-head">
        <h3 className="conn-card-title">{source.label}</h3>
        <span className={`conn-badge conn-badge-${status.tone}`}>{status.label}</span>
      </div>

      {revoked ? (
        <p className="conn-muted">This source is revoked. Its URL no longer accepts leads.</p>
      ) : (
        <div className="conn-url-row">
          <label className="conn-muted" htmlFor={`url-${source.id}`}>
            Paste this URL into your form tool:
          </label>
          <div className="conn-url-input">
            <input
              id={`url-${source.id}`}
              readOnly
              aria-label="Webhook URL"
              value={source.webhookUrl ?? ''}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" onClick={copyUrl} disabled={busy !== null}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {source.previousTokenInUse && !revoked && (
        <p className="conn-alert" role="status">
          Your old URL is still receiving leads. Update your form tool to the current URL — the old
          one stops working 72 hours after rotation.
        </p>
      )}

      <div className="conn-stats">
        <Stat label="Leads" value={String(source.leadCount)} />
        <Stat label="Deliveries" value={String(source.eventCount)} />
        <Stat label="Last lead" value={formatWhen(source.lastEventAt)} />
        {source.lastParseWarningAt && (
          <Stat label="Last parse warning" value={formatWhen(source.lastParseWarningAt)} />
        )}
      </div>

      {error && (
        <p className="conn-error" role="alert">
          {error}
        </p>
      )}

      {!revoked && (
        <div className="conn-actions">
          <button
            type="button"
            onClick={() => run('rotate', () => onRotate(source.id))}
            disabled={busy !== null}
          >
            {busy === 'rotate' ? 'Rotating…' : 'Rotate URL'}
          </button>
          <button
            type="button"
            className="conn-danger"
            onClick={() => run('revoke', () => onRevoke(source.id))}
            disabled={busy !== null}
          >
            {busy === 'revoke' ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="conn-stat">
      <span className="conn-stat-label">{label}</span>
      <span className="conn-stat-value">{value}</span>
    </div>
  );
}
