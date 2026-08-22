import type { Lead } from './parser';
import type { LeakSummary, LeadWithLeaks } from './leaks';

export interface RevenueSummary {
  potentialMissedRevenue: number;
  contactedRevenueAtRisk: number;
  confirmedRecoveredRevenue: number;
  defaultAverageTicket: number;
}

const DEFAULT_AVERAGE_TICKET = 25000; // cents

function getLeadValue(lead: Lead): number {
  return lead.estimated_value > 0 ? lead.estimated_value : DEFAULT_AVERAGE_TICKET;
}

function isTerminal(status: string): boolean {
  const terminal = ['booked', 'lost', 'recovered', 'won'];
  return terminal.includes(status.toLowerCase());
}

function isRecovered(status: string): boolean {
  return ['recovered', 'won', 'booked'].includes(status.toLowerCase());
}

function hasFollowUpLeak(lead: LeadWithLeaks): boolean {
  return lead.leaks.includes('no_follow_up');
}

export function computeRevenue(
  leads: LeadWithLeaks[],
  leakSummary: LeakSummary,
  defaultAverageTicket: number = DEFAULT_AVERAGE_TICKET
): RevenueSummary {
  let potentialMissedRevenue = 0;
  let contactedRevenueAtRisk = 0;
  let confirmedRecoveredRevenue = 0;

  for (const lead of leads) {
    const value = lead.estimated_value > 0 ? lead.estimated_value : defaultAverageTicket;
    const status = lead.status.toLowerCase();
    const terminal = isTerminal(status);
    const recovered = isRecovered(status);

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