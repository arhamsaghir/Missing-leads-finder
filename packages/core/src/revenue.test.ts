import { describe, it, expect } from 'vitest';
import { computeRevenue, formatCurrency } from './revenue';
import type { LeadWithLeaks } from './leaks';
import type { Lead } from './parser';

function baseLead(overrides: Partial<LeadWithLeaks> = {}): LeadWithLeaks {
  return {
    lead_id: 'L1',
    created_at: '2024-01-01T10:00:00Z',
    customer_name: 'Test',
    contact: 'test@test.com',
    source: 'Web',
    status: 'new',
    estimated_value: 50000,
    notes: '',
    row_errors: [],
    row_warnings: [],
    leaks: [],
    ...overrides,
  };
}

describe('computeRevenue', () => {
  it('uses default average ticket when estimated_value missing', () => {
    const leads = [baseLead({ lead_id: 'L1', estimated_value: 0, leaks: ['no_reply'] })];
    const leakSummary = { leads, totalLeads: 1, uniqueAffected: 1, noReply: 1, slowReply: 0, noFollowUp: 0, staleQuote: 0 };
    const result = computeRevenue(leads, leakSummary);
    expect(result.potentialMissedRevenue).toBe(25000); // default 250 dollars
  });

  it('uses explicit estimated_value in cents', () => {
    const leads = [baseLead({ lead_id: 'L1', estimated_value: 100000, leaks: ['no_reply'] })];
    const leakSummary = { leads, totalLeads: 1, uniqueAffected: 1, noReply: 1, slowReply: 0, noFollowUp: 0, staleQuote: 0 };
    const result = computeRevenue(leads, leakSummary);
    expect(result.potentialMissedRevenue).toBe(100000);
  });

  it('does NOT double-count multi-flag leads in potentialMissedRevenue', () => {
    const leads = [baseLead({ lead_id: 'L1', estimated_value: 50000, leaks: ['no_reply', 'slow_reply', 'no_follow_up'] })];
    const leakSummary = { leads, totalLeads: 1, uniqueAffected: 1, noReply: 1, slowReply: 1, noFollowUp: 1, staleQuote: 0 };
    const result = computeRevenue(leads, leakSummary);
    expect(result.potentialMissedRevenue).toBe(50000); // counted once
  });

  it('excludes terminal statuses from potentialMissedRevenue', () => {
    const terminals = ['booked', 'lost', 'recovered', 'won'] as const;
    for (const status of terminals) {
      const leads = [baseLead({ lead_id: `L-${status}`, status, leaks: ['no_reply'], estimated_value: 50000 })];
      const leakSummary = { leads, totalLeads: 1, uniqueAffected: 1, noReply: 1, slowReply: 0, noFollowUp: 0, staleQuote: 0 };
      const result = computeRevenue(leads, leakSummary);
      expect(result.potentialMissedRevenue).toBe(0);
    }
  });

  it('includes contacted/qualified with follow-up leak in contactedRevenueAtRisk', () => {
    const leads = [
      baseLead({ lead_id: 'L1', status: 'contacted', leaks: ['no_follow_up'], estimated_value: 30000 }),
      baseLead({ lead_id: 'L2', status: 'qualified', leaks: ['no_follow_up', 'stale_quote'], estimated_value: 40000 }),
    ];
    const leakSummary = { leads, totalLeads: 2, uniqueAffected: 2, noReply: 0, slowReply: 0, noFollowUp: 2, staleQuote: 1 };
    const result = computeRevenue(leads, leakSummary);
    expect(result.contactedRevenueAtRisk).toBe(70000);
  });

  it('excludes non-contacted/qualified from contactedRevenueAtRisk', () => {
    const leads = [
      baseLead({ lead_id: 'L1', status: 'new', leaks: ['no_follow_up'], estimated_value: 30000 }),
      baseLead({ lead_id: 'L2', status: 'lost', leaks: ['no_follow_up'], estimated_value: 40000 }),
    ];
    const leakSummary = { leads, totalLeads: 2, uniqueAffected: 2, noReply: 0, slowReply: 0, noFollowUp: 2, staleQuote: 0 };
    const result = computeRevenue(leads, leakSummary);
    expect(result.contactedRevenueAtRisk).toBe(0);
  });

  it('confirmedRecoveredRevenue includes recovered/booked/won', () => {
    const statuses = ['recovered', 'booked', 'won'] as const;
    for (const status of statuses) {
      const leads = [baseLead({ lead_id: `L-${status}`, status, estimated_value: 60000 })];
      const leakSummary = { leads, totalLeads: 1, uniqueAffected: 0, noReply: 0, slowReply: 0, noFollowUp: 0, staleQuote: 0 };
      const result = computeRevenue(leads, leakSummary);
      expect(result.confirmedRecoveredRevenue).toBe(60000);
    }
  });

  it('confirmedRecoveredRevenue is zero for non-recovered statuses', () => {
    const leads = [baseLead({ lead_id: 'L1', status: 'contacted', estimated_value: 60000 })];
    const leakSummary = { leads, totalLeads: 1, uniqueAffected: 0, noReply: 0, slowReply: 0, noFollowUp: 0, staleQuote: 0 };
    const result = computeRevenue(leads, leakSummary);
    expect(result.confirmedRecoveredRevenue).toBe(0);
  });

  it('potentialMissedRevenue and confirmedRecoveredRevenue are separate', () => {
    const leads = [
      baseLead({ lead_id: 'L1', status: 'new', leaks: ['no_reply'], estimated_value: 50000 }), // potential only
      baseLead({ lead_id: 'L2', status: 'recovered', estimated_value: 60000 }), // recovered only
    ];
    const leakSummary = { leads, totalLeads: 2, uniqueAffected: 1, noReply: 1, slowReply: 0, noFollowUp: 0, staleQuote: 0 };
    const result = computeRevenue(leads, leakSummary);
    expect(result.potentialMissedRevenue).toBe(50000);
    expect(result.confirmedRecoveredRevenue).toBe(60000);
  });

  it('respects custom defaultAverageTicket', () => {
    const leads = [baseLead({ lead_id: 'L1', estimated_value: 0, leaks: ['no_reply'] })];
    const leakSummary = { leads, totalLeads: 1, uniqueAffected: 1, noReply: 1, slowReply: 0, noFollowUp: 0, staleQuote: 0 };
    const result = computeRevenue(leads, leakSummary, 10000);
    expect(result.potentialMissedRevenue).toBe(10000);
  });
});

describe('formatCurrency', () => {
  it('formats cents to dollars with commas', () => {
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(25000)).toBe('$250');
    expect(formatCurrency(123400)).toBe('$1,234');
    expect(formatCurrency(1000000)).toBe('$10,000');
  });

  it('rounds to whole dollars', () => {
    expect(formatCurrency(25050)).toBe('$251');
    expect(formatCurrency(25049)).toBe('$250');
  });
});