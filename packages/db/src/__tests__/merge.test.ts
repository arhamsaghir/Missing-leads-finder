import { describe, expect, it } from 'vitest';
import { buildDedupeKey, mergeLeadFields, type MergeableLead } from '../repo/ingest';

/**
 * Pure tests — no database. This is the policy that decides whether a second
 * sighting of a lead improves the record or corrupts it, so it is worth pinning
 * down independently of Postgres.
 */

function existing(overrides: Partial<MergeableLead> = {}): MergeableLead {
  return {
    customerName: 'Unknown',
    email: null,
    phone: null,
    status: 'new',
    lastContactAt: null,
    nextFollowUpAt: null,
    estimatedValue: 25000,
    notes: '',
    ...overrides,
  };
}

describe('mergeLeadFields', () => {
  it('makes no changes when the new sighting adds nothing', () => {
    const before = existing({ customerName: 'Sarah', email: 'a@b.co', estimatedValue: 50000 });
    expect(mergeLeadFields(before, { createdAt: new Date(), customerName: 'Sarah' })).toEqual({});
  });

  it('fills a placeholder name but never overwrites a real one', () => {
    expect(mergeLeadFields(existing(), { createdAt: new Date(), customerName: 'Sarah' }))
      .toEqual({ customerName: 'Sarah' });
    expect(
      mergeLeadFields(existing({ customerName: 'Sarah' }), { createdAt: new Date(), customerName: 'S.' }),
    ).toEqual({});
  });

  it('fills a null contact field but never replaces a present one', () => {
    expect(mergeLeadFields(existing(), { createdAt: new Date(), phone: '5551234567' }))
      .toEqual({ phone: '5551234567' });
    expect(
      mergeLeadFields(existing({ phone: '5550000000' }), { createdAt: new Date(), phone: '5551234567' }),
    ).toEqual({});
  });

  it('never nulls out a value that is already known', () => {
    const before = existing({ email: 'a@b.co', phone: '5551234567', customerName: 'Sarah' });
    expect(mergeLeadFields(before, { createdAt: new Date(), email: null, phone: null })).toEqual({});
  });

  it('advances timestamps to the later of the two', () => {
    const before = existing({ lastContactAt: new Date('2026-08-01T00:00:00Z') });
    const merged = mergeLeadFields(before, {
      createdAt: new Date(),
      lastContactAt: new Date('2026-08-05T00:00:00Z'),
    });
    expect(merged.lastContactAt).toEqual(new Date('2026-08-05T00:00:00Z'));
  });

  it('does not move a timestamp backwards', () => {
    const before = existing({ lastContactAt: new Date('2026-08-05T00:00:00Z') });
    expect(
      mergeLeadFields(before, { createdAt: new Date(), lastContactAt: new Date('2026-08-01T00:00:00Z') }),
    ).toEqual({});
  });

  it('sets a timestamp that was previously unknown', () => {
    const merged = mergeLeadFields(existing(), {
      createdAt: new Date(),
      lastContactAt: new Date('2026-08-05T00:00:00Z'),
    });
    expect(merged.lastContactAt).toEqual(new Date('2026-08-05T00:00:00Z'));
  });

  it('advances a non-terminal status', () => {
    expect(mergeLeadFields(existing({ status: 'new' }), { createdAt: new Date(), status: 'contacted' }))
      .toEqual({ status: 'contacted' });
  });

  it.each(['booked', 'lost', 'recovered', 'won'] as const)(
    'never regresses %s — a late form submission must not reopen it',
    (terminal) => {
      expect(
        mergeLeadFields(existing({ status: terminal }), { createdAt: new Date(), status: 'new' }),
      ).toEqual({});
    },
  );

  it('raises estimated value but never lowers it', () => {
    expect(mergeLeadFields(existing({ estimatedValue: 25000 }), { createdAt: new Date(), estimatedValue: 90000 }))
      .toEqual({ estimatedValue: 90000 });
    expect(mergeLeadFields(existing({ estimatedValue: 90000 }), { createdAt: new Date(), estimatedValue: 25000 }))
      .toEqual({});
  });

  it('leaves value alone when the new sighting omits it', () => {
    expect(mergeLeadFields(existing({ estimatedValue: 90000 }), { createdAt: new Date() })).toEqual({});
  });

  it('fills empty notes only', () => {
    expect(mergeLeadFields(existing(), { createdAt: new Date(), notes: 'asked about balayage' }))
      .toEqual({ notes: 'asked about balayage' });
    expect(mergeLeadFields(existing({ notes: 'first note' }), { createdAt: new Date(), notes: 'second' }))
      .toEqual({});
  });
});

describe('buildDedupeKey', () => {
  it('is deterministic', () => {
    expect(buildDedupeKey({ sourceId: 's', providerEventId: 'e' })).toBe(
      buildDedupeKey({ sourceId: 's', providerEventId: 'e' }),
    );
  });

  it('is insensitive to payload key order', () => {
    expect(buildDedupeKey({ sourceId: 's', payload: { b: 2, a: 1 } })).toBe(
      buildDedupeKey({ sourceId: 's', payload: { a: 1, b: 2 } }),
    );
  });

  it('is insensitive to key order in nested objects and preserves array order', () => {
    expect(buildDedupeKey({ sourceId: 's', payload: { o: { y: 1, x: 2 } } })).toBe(
      buildDedupeKey({ sourceId: 's', payload: { o: { x: 2, y: 1 } } }),
    );
    expect(buildDedupeKey({ sourceId: 's', payload: [1, 2] })).not.toBe(
      buildDedupeKey({ sourceId: 's', payload: [2, 1] }),
    );
  });

  it('prefers the provider id over the payload, so re-serialization is irrelevant', () => {
    const a = buildDedupeKey({ sourceId: 's', providerEventId: 'e', payload: { v: 1 } });
    const b = buildDedupeKey({ sourceId: 's', providerEventId: 'e', payload: { v: 2 } });
    expect(a).toBe(b);
  });

  it('produces a hex sha256', () => {
    expect(buildDedupeKey({ sourceId: 's', providerEventId: 'e' })).toMatch(/^[0-9a-f]{64}$/);
  });
});
