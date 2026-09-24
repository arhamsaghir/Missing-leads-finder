import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/render';
import { ConnectionCard } from './ConnectionCard';
import type { SourceResponse } from '../lib/api';

const base: SourceResponse = {
  id: 's1',
  label: 'Website form',
  kind: 'webhook',
  webhookUrl: 'https://app.test/api/hook/tok-abc',
  createdAt: '2026-09-01T00:00:00.000Z',
  revokedAt: null,
  lastEventAt: null,
  eventCount: 0,
  leadCount: 0,
  previousTokenInUse: false,
  lastParseWarningAt: null,
};

const noop = async () => {};

describe('ConnectionCard', () => {
  it('shows the webhook URL and a waiting status before any lead', () => {
    renderWithProviders(<ConnectionCard source={base} onRotate={noop} onRevoke={noop} />);
    expect(screen.getByLabelText('Webhook URL')).toHaveValue('https://app.test/api/hook/tok-abc');
    expect(screen.getByText(/waiting for first lead/i)).toBeInTheDocument();
  });

  it('shows a receiving status and live counts once leads arrive', () => {
    renderWithProviders(
      <ConnectionCard source={{ ...base, eventCount: 5, leadCount: 3 }} onRotate={noop} onRevoke={noop} />,
    );
    expect(screen.getByText(/receiving leads/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('warns when the previous token is still in use', () => {
    renderWithProviders(
      <ConnectionCard source={{ ...base, previousTokenInUse: true }} onRotate={noop} onRevoke={noop} />,
    );
    expect(screen.getByText(/old url is still receiving leads/i)).toBeInTheDocument();
  });

  it('hides the URL and actions once revoked', () => {
    renderWithProviders(
      <ConnectionCard
        source={{ ...base, revokedAt: '2026-09-02T00:00:00.000Z', webhookUrl: null }}
        onRotate={noop}
        onRevoke={noop}
      />,
    );
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rotate/i })).not.toBeInTheDocument();
    // Exact match: /revoked/i also hits the "This source is revoked." body copy,
    // so match the status badge's own text.
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('calls onRotate with the source id', async () => {
    const onRotate = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ConnectionCard source={base} onRotate={onRotate} onRevoke={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /rotate url/i }));
    await waitFor(() => expect(onRotate).toHaveBeenCalledWith('s1'));
  });

  it('surfaces an action failure without crashing', async () => {
    const onRevoke = vi.fn().mockRejectedValue(new Error('boom'));
    renderWithProviders(<ConnectionCard source={base} onRotate={noop} onRevoke={onRevoke} />);
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
