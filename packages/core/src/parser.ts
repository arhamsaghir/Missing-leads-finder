export interface Lead {
  lead_id: string;
  created_at: string;
  customer_name: string;
  contact: string;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'booked' | 'lost' | 'recovered' | 'won';
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

const VALID_STATUSES = ['new', 'contacted', 'qualified', 'booked', 'lost', 'recovered', 'won'];

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
      status: status as any,
      estimated_value,
      notes,
      row_errors: rowErrors,
      row_warnings: rowWarnings
    });
  }

  return { leads, errors, warnings };
}
