import { describe, it, expect } from 'vitest';
import { classifyContact, normalizeEmail, normalizePhone } from './normalize';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  JOHN@Example.COM ')).toBe('john@example.com');
  });

  it('accepts a plain address unchanged', () => {
    expect(normalizeEmail('john@example.com')).toBe('john@example.com');
  });

  it('preserves plus tags and dots — they can address distinct people', () => {
    expect(normalizeEmail('john+leads@example.com')).toBe('john+leads@example.com');
    expect(normalizeEmail('john.doe@example.com')).toBe('john.doe@example.com');
  });

  it('rejects things that are not addresses', () => {
    for (const bad of ['', '   ', 'john', 'john@', '@example.com', 'ask for Bob', 'a@b', 'a b@example.com']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe('normalizePhone', () => {
  it('strips punctuation from a 10-digit number', () => {
    expect(normalizePhone('555-123-4567')).toBe('5551234567');
    expect(normalizePhone('(555) 123 4567')).toBe('5551234567');
  });

  it('drops a NANP country code so both spellings collide', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('5551234567');
    expect(normalizePhone('15551234567')).toBe('5551234567');
    expect(normalizePhone('555-123-4567')).toBe('5551234567');
  });

  it('keeps all digits for international numbers rather than truncating', () => {
    // Truncating to the last 10 would silently merge distinct foreign numbers.
    expect(normalizePhone('+44 20 7123 4567')).toBe('442071234567');
  });

  it('rejects anything too short to be a phone number', () => {
    for (const bad of ['', '   ', '12345', '555-1234', 'ask for Bob']) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});

describe('classifyContact', () => {
  it('recognises an email', () => {
    expect(classifyContact(' Jane@Example.com ')).toEqual({
      kind: 'email',
      raw: 'Jane@Example.com',
      normalized: 'jane@example.com',
    });
  });

  it('recognises a phone number', () => {
    expect(classifyContact('+1 (555) 123-4567')).toEqual({
      kind: 'phone',
      raw: '+1 (555) 123-4567',
      normalized: '5551234567',
    });
  });

  it('prefers email when the value looks like both', () => {
    // Some CRMs export "john@example.com / 555-123-4567" in one cell.
    expect(classifyContact('john@example.com 5551234567')?.kind).toBe('email');
  });

  it('returns null for unclassifiable contacts', () => {
    // parseLeadsCSV accepts any non-empty contact, so free text reaches here.
    // Null means "store the lead, but it has no identity to dedupe on".
    expect(classifyContact('ask for Bob')).toBeNull();
    expect(classifyContact('')).toBeNull();
  });

  it('is stable — the same human via two channels normalizes identically', () => {
    const viaForm = classifyContact('Sarah.M@Salon.com');
    const viaEmail = classifyContact('sarah.m@salon.com');
    expect(viaForm!.normalized).toBe(viaEmail!.normalized);
  });
});
