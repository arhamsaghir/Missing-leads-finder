import { describe, it, expect } from 'vitest';
import { detectLeaks } from './leaks';
function baseLead(overrides = {}) {
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
        ...overrides,
    };
}
describe('detectLeaks', () => {
    const now = new Date('2024-01-10T10:00:00Z');
    it('flags no_reply when last_contact_at is blank and not terminal', () => {
        const leads = [baseLead({ last_contact_at: undefined })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).toContain('no_reply');
        expect(result.noReply).toBe(1);
    });
    it('does NOT flag no_reply for terminal statuses', () => {
        const terminalStatuses = ['booked', 'lost', 'recovered'];
        for (const status of terminalStatuses) {
            const leads = [baseLead({ status, last_contact_at: undefined })];
            const result = detectLeaks(leads, now);
            expect(result.leads[0].leaks).not.toContain('no_reply');
        }
    });
    it('flags slow_reply when reply > 24h after created', () => {
        const leads = [baseLead({
                created_at: '2024-01-01T10:00:00Z',
                last_contact_at: '2024-01-02T11:00:00Z', // 25h later
            })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).toContain('slow_reply');
        expect(result.slowReply).toBe(1);
    });
    it('does NOT flag slow_reply when reply <= 24h', () => {
        const leads = [baseLead({
                created_at: '2024-01-01T10:00:00Z',
                last_contact_at: '2024-01-01T20:00:00Z', // 10h later
            })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).not.toContain('slow_reply');
    });
    it('does NOT flag slow_reply for terminal statuses', () => {
        const leads = [baseLead({
                status: 'booked',
                created_at: '2024-01-01T10:00:00Z',
                last_contact_at: '2024-01-02T11:00:00Z',
            })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).not.toContain('slow_reply');
    });
    it('flags no_follow_up for contacted/qualified without next_follow_up_at', () => {
        const contacted = baseLead({ status: 'contacted', next_follow_up_at: undefined });
        const qualified = baseLead({ status: 'qualified', lead_id: 'L2', next_follow_up_at: undefined });
        const result = detectLeaks([contacted, qualified], now);
        expect(result.leads[0].leaks).toContain('no_follow_up');
        expect(result.leads[1].leaks).toContain('no_follow_up');
        expect(result.noFollowUp).toBe(2);
    });
    it('does NOT flag no_follow_up when next_follow_up_at exists', () => {
        const leads = [baseLead({ status: 'contacted', next_follow_up_at: '2024-01-15T10:00:00Z' })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).not.toContain('no_follow_up');
    });
    it('flags stale_quote for qualified > 7 days since last contact', () => {
        const leads = [baseLead({
                status: 'qualified',
                created_at: '2024-01-01T10:00:00Z',
                last_contact_at: '2024-01-01T10:00:00Z', // 9 days ago from now (Jan 10)
            })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).toContain('stale_quote');
        expect(result.staleQuote).toBe(1);
    });
    it('does NOT flag stale_quote for qualified <= 7 days since last contact', () => {
        const leads = [baseLead({
                status: 'qualified',
                created_at: '2024-01-05T10:00:00Z',
                last_contact_at: '2024-01-05T10:00:00Z', // 5 days ago
            })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).not.toContain('stale_quote');
    });
    it('does NOT flag stale_quote for non-qualified statuses', () => {
        const leads = [baseLead({ status: 'contacted', last_contact_at: '2024-01-01T10:00:00Z' })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).not.toContain('stale_quote');
    });
    it('multi-flag lead counts once in uniqueAffected', () => {
        const leads = [baseLead({
                status: 'qualified',
                next_follow_up_at: undefined,
                last_contact_at: '2024-01-01T10:00:00Z',
            })];
        const result = detectLeaks(leads, now);
        expect(result.leads[0].leaks).toContain('no_follow_up');
        expect(result.leads[0].leaks).toContain('stale_quote');
        expect(result.uniqueAffected).toBe(1);
        expect(result.totalLeads).toBe(1);
    });
    it('returns correct aggregate counts', () => {
        const leads = [
            baseLead({ lead_id: 'L1', last_contact_at: undefined }), // no_reply
            baseLead({ lead_id: 'L2', created_at: '2024-01-01T10:00:00Z', last_contact_at: '2024-01-02T11:00:00Z' }), // slow_reply
            baseLead({ lead_id: 'L3', status: 'contacted', last_contact_at: '2024-01-05T10:00:00Z', next_follow_up_at: undefined }), // slow_reply + no_follow_up
            baseLead({ lead_id: 'L4', status: 'qualified', last_contact_at: '2024-01-01T10:00:00Z' }), // no_follow_up + stale_quote
            baseLead({ lead_id: 'L5', status: 'booked', last_contact_at: undefined }), // terminal, no leaks
        ];
        const result = detectLeaks(leads, now);
        expect(result.totalLeads).toBe(5);
        expect(result.uniqueAffected).toBe(4);
        expect(result.noReply).toBe(1);
        expect(result.slowReply).toBe(2); // L2 (25h) + L3 (96h)
        expect(result.noFollowUp).toBe(2); // L3 (contacted) + L4 (qualified)
        expect(result.staleQuote).toBe(1);
    });
});
//# sourceMappingURL=leaks.test.js.map