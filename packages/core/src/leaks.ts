import type { Lead } from './parser';

export type LeakType = 'no_reply' | 'slow_reply' | 'no_follow_up' | 'stale_quote';

export interface LeadWithLeaks extends Lead {
  leaks: LeakType[];
}

export interface LeakSummary {
  totalLeads: number;
  uniqueAffected: number;
  noReply: number;
  slowReply: number;
  noFollowUp: number;
  staleQuote: number;
  leads: LeadWithLeaks[];
}

const SLOW_REPLY_HOURS = 24;
const STALE_QUOTE_DAYS = 7;
const TERMINAL_STATUSES = ['booked', 'lost', 'recovered', 'won'] as const;

function parseDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function daysBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

export function detectLeaks(leads: Lead[], now: Date = new Date()): LeakSummary {
  const leadsWithLeaks: LeadWithLeaks[] = [];
  const leakCounts = { noReply: 0, slowReply: 0, noFollowUp: 0, staleQuote: 0 };

  for (const lead of leads) {
    const leaks: LeakType[] = [];
    const status = lead.status.toLowerCase();
    const isTerminal = TERMINAL_STATUSES.includes(status as any);

    const createdAt = parseDate(lead.created_at);
    const lastContactAt = parseDate(lead.last_contact_at);
    const nextFollowUpAt = parseDate(lead.next_follow_up_at);

    // no_reply: no last_contact_at AND not terminal
    if (!lastContactAt && !isTerminal) {
      leaks.push('no_reply');
      leakCounts.noReply++;
    }

    // slow_reply: reply > 24h after created AND not terminal
    if (createdAt && lastContactAt && hoursBetween(createdAt, lastContactAt) > SLOW_REPLY_HOURS && !isTerminal) {
      leaks.push('slow_reply');
      leakCounts.slowReply++;
    }

    // no_follow_up: status contacted/qualified AND no next_follow_up_at
    if ((status === 'contacted' || status === 'qualified') && !nextFollowUpAt) {
      leaks.push('no_follow_up');
      leakCounts.noFollowUp++;
    }

    // stale_quote: status qualified AND last_contact_at > 7 days ago
    if (status === 'qualified' && lastContactAt && daysBetween(lastContactAt, now) > STALE_QUOTE_DAYS) {
      leaks.push('stale_quote');
      leakCounts.staleQuote++;
    }

    leadsWithLeaks.push({ ...lead, leaks });
  }

  // unique affected = leads with at least one leak
  const uniqueAffected = leadsWithLeaks.filter(l => l.leaks.length > 0).length;

  return {
    totalLeads: leads.length,
    uniqueAffected,
    noReply: leakCounts.noReply,
    slowReply: leakCounts.slowReply,
    noFollowUp: leakCounts.noFollowUp,
    staleQuote: leakCounts.staleQuote,
    leads: leadsWithLeaks,
  };
}