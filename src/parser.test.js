import { describe, it, expect } from 'vitest';
import { parseLeadsCSV } from './parser';
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
        expect(result.leads[0].customer_name).toBe('Doe, John');
        expect(result.leads[0].notes).toBe('Likes cats, dogs');
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
        expect(result.leads[0].estimated_value).toBe(25000); // default 250 dollars
        expect(result.warnings).toContainEqual(expect.objectContaining({
            row: 1,
            message: expect.stringContaining('estimated_value')
        }));
    });
    it('maps unknown status to new with warning', () => {
        const csv = `lead_id,customer_name,contact,status
L6,Unknown Status,test@test.com,super-hot`;
        const result = parseLeadsCSV(csv);
        expect(result.leads[0].status).toBe('new');
        expect(result.warnings).toContainEqual(expect.objectContaining({
            row: 1,
            message: expect.stringContaining('status')
        }));
    });
});
//# sourceMappingURL=parser.test.js.map