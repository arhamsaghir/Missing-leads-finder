import { describe, it, expect } from 'vitest';
import { parseLeadsCSV } from './parser';
import { detectLeaks } from './leaks';

describe('parseLeadsCSV', () => {
  it('parses canonical CSV correctly', () => {
    const csv = `lead_id,created_at,customer_name,contact,source,status,estimated_value,notes
L1,2024-01-01,John Doe,john@example.com,Web,new,500.00,Interested`;
    const result = parseLeadsCSV(csv);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      lead_id: 'L1',
      customer_name: 'John Doe',
      contact: 'john@example.com',
      estimated_value: 50000, // cents
      status: 'new'
    });
  });

  it('handles header aliases', () => {
    const csv = `ID,Date,Name,Email,Source,Status,Value,Notes
L2,01/02/2024,Jane Smith,jane@example.com,Referral,won,1000,Big deal`;
    const result = parseLeadsCSV(csv);
    expect(result.leads[0]).toMatchObject({
      lead_id: 'L2',
      customer_name: 'Jane Smith',
      estimated_value: 100000
    });
  });

  it('handles quoted cells with commas', () => {
    const csv = `lead_id,customer_name,contact,notes
L3,"Doe, John",john@example.com,"Likes cats, dogs"`;
    const result = parseLeadsCSV(csv);
    expect(result.leads[0]!.customer_name).toBe('Doe, John');
    expect(result.leads[0]!.notes).toBe('Likes cats, dogs');
  });

  it('reports error for missing contact', () => {
    const csv = `lead_id,customer_name,contact
L4,No Contact,`;
    const result = parseLeadsCSV(csv);
    expect(result.leads).toHaveLength(0);
    expect(result.errors).toContainEqual(expect.objectContaining({
      row: 1,
      message: expect.stringContaining('contact')
    }));
  });

  it('handles invalid money and uses default ticket value', () => {
    const csv = `lead_id,customer_name,contact,estimated_value
L5,Invalid Money,test@test.com,not-money`;
    const result = parseLeadsCSV(csv);
    expect(result.leads[0]!.estimated_value).toBe(25000); // default 250 dollars
    expect(result.warnings).toContainEqual(expect.objectContaining({
      row: 1,
      message: expect.stringContaining('estimated_value')
    }));
  });

  it('maps unknown status to new with warning', () => {
    const csv = `lead_id,customer_name,contact,status
L6,Unknown Status,test@test.com,super-hot`;
    const result = parseLeadsCSV(csv);
    expect(result.leads[0]!.status).toBe('new');
    expect(result.warnings).toContainEqual(expect.objectContaining({
      row: 1,
      message: expect.stringContaining('status')
    }));
  });

  // Regression: both columns were in HEADER_MAP but never written to the Lead,
  // so every parsed lead looked like no_reply and slow_reply/no_follow_up/
  // stale_quote were unreachable through the CSV path.
  it('preserves last_contact_at and next_follow_up_at', () => {
    const csv = `lead_id,customer_name,contact,status,last_contact_at,next_follow_up_at
L7,Followed Up,test@test.com,contacted,2024-01-02T11:00:00Z,2024-01-09T10:00:00Z`;
    const result = parseLeadsCSV(csv);
    expect(result.leads[0]!.last_contact_at).toBe('2024-01-02T11:00:00Z');
    expect(result.leads[0]!.next_follow_up_at).toBe('2024-01-09T10:00:00Z');
  });

  it('leaves the date fields undefined when absent or blank', () => {
    const csv = `lead_id,customer_name,contact,last_contact_at
L8,No Dates,test@test.com,`;
    const result = parseLeadsCSV(csv);
    expect(result.leads[0]!.last_contact_at).toBeUndefined();
    expect(result.leads[0]!.next_follow_up_at).toBeUndefined();
  });

  it('feeds parsed dates into leak detection end to end', () => {
    const csv = `lead_id,created_at,customer_name,contact,status,last_contact_at
L9,2024-01-01T10:00:00Z,Slow Reply,test@test.com,contacted,2024-01-02T11:00:00Z`;
    const result = parseLeadsCSV(csv);
    const summary = detectLeaks(result.leads, new Date('2024-01-10T10:00:00Z'));
    // 25h between created_at and last_contact_at
    expect(summary.leads[0]!.leaks).toContain('slow_reply');
    expect(summary.leads[0]!.leaks).not.toContain('no_reply');
  });
});
