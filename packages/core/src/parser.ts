/**
 * The lead lifecycle. Single source of truth — the Postgres enum, the parser's
 * validation, and the engine's terminal checks are all derived from these.
 */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'booked',
  'lost',
  'recovered',
  'won',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses where the lead has left the pipeline — no leak can be "fixed". */
export const TERMINAL_STATUSES = ['booked', 'lost', 'recovered', 'won'] as const;

/**
 * Statuses counted as recovered revenue. Note `booked` is included here while
 * it is merely terminal above — preserved from the original implementation
 * (was revenue.ts `isRecovered`). Deliberate, not a typo.
 */
export const RECOVERED_STATUSES = ['recovered', 'won', 'booked'] as const;

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status.toLowerCase());
}

export function isRecoveredStatus(status: string): boolean {
  return (RECOVERED_STATUSES as readonly string[]).includes(status.toLowerCase());
}

export interface Lead {
  lead_id: string;
  created_at: string;
  customer_name: string;
  contact: string;
  source: string;
  status: LeadStatus;
  last_contact_at?: string;
  next_follow_up_at?: string;
  estimated_value: number; // cents
  notes: string;
  row_errors: string[];
  row_warnings: string[];
}

export interface ParseResult {
  leads: Lead[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}

const DEFAULT_TICKET_VALUE = 25000; // 250 dollars in cents

const HEADER_MAP: Record<string, keyof Lead | 'ignore'> = {
  'lead_id': 'lead_id',
  'id': 'lead_id',
  'created_at': 'created_at',
  'date': 'created_at',
  'customer_name': 'customer_name',
  'name': 'customer_name',
  'contact': 'contact',
  'email': 'contact',
  'source': 'source',
  'status': 'status',
  'last_contact_at': 'last_contact_at',
  'next_follow_up_at': 'next_follow_up_at',
  'estimated_value': 'estimated_value',
  'value': 'estimated_value',
  'notes': 'notes'
};

const VALID_STATUSES: readonly string[] = LEAD_STATUSES;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  result.push(cell.trim());
  return result;
}

export function parseLeadsCSV(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { leads: [], errors: [], warnings: [] };

  const firstLine = lines[0];
  if (!firstLine) return { leads: [], errors: [], warnings: [] };

  const headers = parseCSVLine(firstLine).map(h => h.toLowerCase());
  const leads: Lead[] = [];
  const errors: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = parseCSVLine(line);
    const raw: any = {};
headers.forEach((h, idx) => {
      const key = HEADER_MAP[h];
      if (key && key !== 'ignore') {
        raw[key] = values[idx] ?? '';
      }
    });

    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    // Validation & Normalization
    const lead_id = raw.lead_id || `row-${i}`;
    const customer_name = raw.customer_name || 'Unknown';
    const contact = (raw.contact ?? '').trim();
    const source = raw.source ?? 'Manual';
    const notes = raw.notes ?? '';
    // Blank cells must stay undefined, not '': the leak rules test these for
    // presence, and '' would read as "we contacted them at the epoch".
    const last_contact_at = (raw.last_contact_at ?? '').trim() || undefined;
    const next_follow_up_at = (raw.next_follow_up_at ?? '').trim() || undefined;

    if (!contact) {
      errors.push({ row: i, message: `Row ${i}: Missing contact information` });
      continue;
    }

    let status = (raw.status || 'new').toLowerCase();
    if (!VALID_STATUSES.includes(status)) {
      rowWarnings.push(`Invalid status "${status}", defaulting to "new"`);
      warnings.push({ row: i, message: `Row ${i}: Invalid status "${status}", defaulting to "new"` });
      status = 'new';
    }

    let estimated_value = DEFAULT_TICKET_VALUE;
    if (raw.estimated_value) {
      const parsedValue = parseFloat(raw.estimated_value.replace(/[^0-9.]/g, ''));
      if (isNaN(parsedValue)) {
        rowWarnings.push(`Invalid estimated_value "${raw.estimated_value}", using default`);
        warnings.push({ row: i, message: `Row ${i}: Invalid estimated_value "${raw.estimated_value}", using default` });
      } else {
        estimated_value = Math.round(parsedValue * 100);
      }
    }

    leads.push({
      lead_id,
      created_at: raw.created_at || new Date().toISOString(),
      customer_name,
      contact,
      source,
      status: status as Lead['status'],
      last_contact_at,
      next_follow_up_at,
      estimated_value,
      notes,
      row_errors: rowErrors,
      row_warnings: rowWarnings
    });
  }

  return { leads, errors, warnings };
}
