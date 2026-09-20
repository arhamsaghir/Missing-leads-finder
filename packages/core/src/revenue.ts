import type { LeakSummary, LeadWithLeaks } from './leaks.js';
import { isRecoveredStatus, isTerminalStatus } from './parser.js';

export interface RevenueSummary {
  potentialMissedRevenue: number;
  contactedRevenueAtRisk: number;
  confirmedRecoveredRevenue: number;
  defaultAverageTicket: number;
}

export const DEFAULT_AVERAGE_TICKET = 25000; // cents

function hasFollowUpLeak(lead: LeadWithLeaks): boolean {
  return lead.leaks.includes('no_follow_up');
}

export function computeRevenue(
  leads: LeadWithLeaks[],
  _leakSummary: LeakSummary | undefined,
  defaultAverageTicket: number = DEFAULT_AVERAGE_TICKET
): RevenueSummary {
  let potentialMissedRevenue = 0;
  let contactedRevenueAtRisk = 0;
  let confirmedRecoveredRevenue = 0;

  for (const lead of leads) {
    const value = lead.estimated_value > 0 ? lead.estimated_value : defaultAverageTicket;
    const status = lead.status.toLowerCase();
    const terminal = isTerminalStatus(status);
    const recovered = isRecoveredStatus(status);

    // potential_missed_revenue: unique unresolved leaked leads (not terminal)
    if (lead.leaks.length > 0 && !terminal) {
      potentialMissedRevenue += value;
    }

    // contacted_revenue_at_risk: contacted/qualified with follow-up leak
    if ((status === 'contacted' || status === 'qualified') && hasFollowUpLeak(lead)) {
      contactedRevenueAtRisk += value;
    }

    // confirmed_recovered_revenue: explicitly recovered/booked
    if (recovered) {
      confirmedRecoveredRevenue += value;
    }
  }

  return {
    potentialMissedRevenue,
    contactedRevenueAtRisk,
    confirmedRecoveredRevenue,
    defaultAverageTicket,
  };
}

export function formatCurrency(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString()}`;
}