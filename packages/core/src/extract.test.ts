import { describe, expect, it } from 'vitest';
import { extractLead, isEmptyExtraction } from './extract';

/** Fixed clock so the 90-day trust window is deterministic. */
const NOW = new Date('2026-08-27T12:00:00.000Z');

describe('extractLead — real provider shapes', () => {
  it('reads a Typeform submission (answer value under a generic key)', () => {
    const lead = extractLead(
      {
        event_id: 'evt_01H8',
        form_response: {
          form_id: 'aB3xY',
          submitted_at: '2026-08-27T11:58:00.000Z',
          answers: [
            { field: { ref: 'full_name' }, type: 'text', text: 'Priya Raman' },
            { field: { ref: 'email' }, type: 'email', email: 'Priya@Example.com' },
            { field: { ref: 'phone' }, type: 'phone_number', phone_number: '+1 (555) 010-2030' },
            { field: { ref: 'message' }, type: 'text', text: 'Balayage on Friday?' },
          ],
        },
      },
      NOW,
    );
    expect(lead.customerName).toBe('Priya Raman');
    expect(lead.email).toBe('priya@example.com');
    expect(lead.phone).toBe('5550102030');
    expect(lead.notes).toBe('Balayage on Friday?');
    expect(lead.providerEventId).toBe('evt_01H8');
    expect(lead.occurredAt?.toISOString()).toBe('2026-08-27T11:58:00.000Z');
    expect(lead.warnings).toEqual([]);
  });

  it('reads a Calendly invitee.created payload', () => {
    const lead = extractLead(
      {
        event: 'invitee.created',
        payload: {
          name: 'Dana Whitfield',
          email: 'dana@example.com',
          created_at: '2026-08-27T09:15:00.000Z',
          questions_and_answers: [
            { question: 'Notes for the stylist', answer: 'Prefer mornings' },
          ],
          scheduled_event: { start_time: '2026-11-02T15:00:00.000Z' },
        },
      },
      NOW,
    );
    expect(lead.customerName).toBe('Dana Whitfield');
    expect(lead.email).toBe('dana@example.com');
    expect(lead.notes).toBe('Prefer mornings');
    // start_time is months out and falls outside the window; created_at wins
    // without a warning because an in-window candidate was found.
    expect(lead.occurredAt?.toISOString()).toBe('2026-08-27T09:15:00.000Z');
    expect(lead.warnings).toEqual([]);
  });

  it('reads a Jotform-style flat payload with q-prefixed keys', () => {
    const lead = extractLead(
      {
        submission_id: '5820119',
        q3_fullName: 'Marcus Webb',
        q4_email: 'marcus.webb@example.com',
        q5_phone: '555.221.9087',
        q6_comments: 'Do you do beard trims?',
      },
      NOW,
    );
    expect(lead.customerName).toBe('Marcus Webb');
    expect(lead.email).toBe('marcus.webb@example.com');
    expect(lead.phone).toBe('5552219087');
    expect(lead.notes).toBe('Do you do beard trims?');
    expect(lead.providerEventId).toBe('5820119');
    // No timestamp key anywhere: the handler will use receipt time. Absent is
    // not the same as wrong, so there is no warning.
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toEqual([]);
  });

  it('reads a flat Zapier-style payload with capitalised keys', () => {
    const lead = extractLead(
      {
        Name: 'Aisha Khan',
        Phone: '(555) 660-1122',
        Comments: 'Wants a quote for highlights',
        order_id: '10054000322',
      },
      NOW,
    );
    expect(lead.customerName).toBe('Aisha Khan');
    expect(lead.phone).toBe('5556601122');
    expect(lead.email).toBeNull();
    expect(lead.notes).toBe('Wants a quote for highlights');
    // order_id is a bare digit run, but a real phone was found first, so
    // nothing was refused and there is nothing to warn about.
    expect(lead.warnings).toEqual([]);
  });
});

describe('extractLead — the two silent-corruption cases', () => {
  it('refuses the business\'s own address in a `from` field', () => {
    // Without this, `hello@sunsetsalon.com` is identical on every submission,
    // matches one lead_identities row every time, and collapses the entire
    // dataset onto a single lead — corrupting the one number the product sells.
    const lead = extractLead(
      {
        from: 'hello@sunsetsalon.com',
        subject: 'New enquiry from your website',
        body: 'Someone asked about balayage',
      },
      NOW,
    );
    expect(lead.email).toBeNull();
    expect(lead.warnings).toContain('email_only_in_business_key');
  });

  it.each([['reply_to'], ['reply-to'], ['sender'], ['owner'], ['account'], ['admin'], ['to']])(
    'refuses an address found only under `%s`',
    (key) => {
      const lead = extractLead({ [key]: 'hello@sunsetsalon.com' }, NOW);
      expect(lead.email).toBeNull();
      expect(lead.warnings).toContain('email_only_in_business_key');
    },
  );

  it('prefers the personal address when a business one is also present', () => {
    const lead = extractLead(
      {
        from: 'hello@sunsetsalon.com',
        customer_email: 'Nadia.Osman@example.com',
        name: 'Nadia Osman',
      },
      NOW,
    );
    expect(lead.email).toBe('nadia.osman@example.com');
    // A usable address was found, so nothing was refused.
    expect(lead.warnings).toEqual([]);
  });

  it('refuses a business address under a suffixed key, even against a real one', () => {
    // `from_email` is not the exact string `from`, so an anchored guard misses it
    // — and because it contains `mail` the email hint PROMOTES it ahead of the
    // real `customer_email`. That is the collapse-every-lead-onto-one-identity
    // corruption, arriving through the key the guard was written to catch.
    const lead = extractLead(
      { from_email: 'hello@sunsetsalon.com', customer_email: 'real@example.com' },
      NOW,
    );
    expect(lead.email).toBe('real@example.com');
    expect(lead.warnings).toEqual([]);
  });

  it.each([['from_email'], ['sender_email'], ['_replyto'], ['reply_to_email'], ['email_from']])(
    'refuses an address found only under `%s`',
    (key) => {
      const lead = extractLead({ [key]: 'hello@sunsetsalon.com' }, NOW);
      expect(lead.email).toBeNull();
      expect(lead.warnings).toContain('email_only_in_business_key');
    },
  );

  it('refuses a bare 10-digit run with no key hint and no formatting', () => {
    // An order id, a zip+4 with an extension, or an epoch value all normalize to
    // a plausible phone. A wrong phone creates a wrong identity, which merges
    // two unrelated humans — and mergeLeadFields is monotonic, so it cannot be
    // undone.
    const lead = extractLead({ reference: '4155550199', notes: 'call me' }, NOW);
    expect(lead.phone).toBeNull();
    expect(lead.warnings).toContain('phone_rejected_unformatted');
  });

  it('accepts a formatted number even with no key hint', () => {
    const lead = extractLead({ reference: '(415) 555-0199' }, NOW);
    expect(lead.phone).toBe('4155550199');
    expect(lead.warnings).toEqual([]);
  });

  it.each([
    ['plus prefix', '+14155550199', '4155550199'],
    ['dashes', '415-555-0199', '4155550199'],
    ['spaces', '415 555 0199', '4155550199'],
    ['dots', '415.555.0199', '4155550199'],
  ])('accepts %s formatting with no key hint', (_label, raw, expected) => {
    expect(extractLead({ reference: raw }, NOW).phone).toBe(expected);
  });

  it('accepts unformatted digits under a phone-hinted key', () => {
    for (const key of ['phone', 'telephone', 'mobile', 'cell', 'q5_phone', 'PhoneNumber']) {
      const lead = extractLead({ [key]: '4155550199' }, NOW);
      expect(lead.phone).toBe('4155550199');
      expect(lead.warnings).toEqual([]);
    }
  });

  it('refuses a punctuated order id that only looks formatted', () => {
    // Dashes are not evidence of a phone number. `ORD-1234-5678-90` reduces to
    // ten digits and carries grouping marks, so a formatting-only check accepts
    // it and writes a wrong lead_identities row.
    const lead = extractLead({ order_number: 'ORD-1234-5678-90' }, NOW);
    expect(lead.phone).toBeNull();
    expect(lead.warnings).toContain('phone_rejected_unformatted');
  });

  it('refuses a formatted currency amount', () => {
    // `10,000,000.00` reduces to ten digits and has dots and commas. Money is
    // never a phone number.
    const lead = extractLead({ amount_due: '10,000,000.00' }, NOW);
    expect(lead.phone).toBeNull();
    expect(lead.warnings).toContain('phone_rejected_unformatted');
  });

  it('refuses a digit run that is the wrong length to be a number', () => {
    // A 12-digit punctuated reference is not a NANP number; without a key hint
    // there is no evidence it is a phone at all.
    const lead = extractLead({ reference: '415-555-019-999' }, NOW);
    expect(lead.phone).toBeNull();
    expect(lead.warnings).toContain('phone_rejected_unformatted');
  });
});

describe('extractLead — timestamps', () => {
  it('rejects an epoch-seconds value read as milliseconds (lands in 1970)', () => {
    // 1970 makes every lead instantly and maximally leaked, which inflates
    // reported lost revenue — the same class of failure as the parser lesson in
    // PROJECT.md:98.
    const lead = extractLead({ email: 'x@example.com', created_at: 1787000000 }, NOW);
    expect(lead.occurredAt).toBeNull();
    // Exact, not toContain: a 10-digit epoch value is also a plausible
    // normalizePhone input and is not DATE_SHAPED, so a phone picker that does
    // not exclude timestamp keys emits a spurious phone_rejected_unformatted on
    // a payload that has no phone field at all. toContain would hide that.
    expect(lead.warnings).toEqual(['timestamp_out_of_window']);
  });

  it('rejects a timestamp more than 90 days old', () => {
    const lead = extractLead(
      { email: 'x@example.com', submitted_at: '2026-01-01T00:00:00.000Z' },
      NOW,
    );
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toContain('timestamp_out_of_window');
  });

  it('rejects a timestamp more than 5 minutes in the future', () => {
    const lead = extractLead(
      { email: 'x@example.com', submitted_at: '2026-08-27T12:06:00.000Z' },
      NOW,
    );
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toContain('timestamp_out_of_window');
  });

  it('accepts the window edges', () => {
    const nearFuture = extractLead(
      { email: 'x@example.com', submitted_at: '2026-08-27T12:04:00.000Z' },
      NOW,
    );
    expect(nearFuture.occurredAt?.toISOString()).toBe('2026-08-27T12:04:00.000Z');
    expect(nearFuture.warnings).toEqual([]);

    const justInside = extractLead(
      { email: 'x@example.com', submitted_at: '2026-06-01T12:00:00.000Z' },
      NOW,
    );
    expect(justInside.occurredAt?.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    expect(justInside.warnings).toEqual([]);
  });

  it('does not warn when no timestamp is present at all', () => {
    // Absent is not wrong. The handler uses receipt time.
    const lead = extractLead({ email: 'x@example.com' }, NOW);
    expect(lead.occurredAt).toBeNull();
    expect(lead.warnings).toEqual([]);
  });
});

describe('extractLead — nothing usable', () => {
  it.each([
    ['empty object', {}],
    ['deeply nested empties', { a: { b: { c: {} } }, d: [] }],
    ['null', null],
    ['a bare string', 'hello'],
    ['a number', 42],
    ['an array of empties', [{}, {}]],
  ])('yields an empty extraction for %s', (_label, payload) => {
    const lead = extractLead(payload, NOW);
    expect(isEmptyExtraction(lead)).toBe(true);
    expect(lead.warnings).toContain('nothing_extracted');
  });

  it('notes alone is not a lead — there is nobody to follow up', () => {
    const lead = extractLead({ message: 'call the shop about Friday' }, NOW);
    expect(lead.notes).toBe('call the shop about Friday');
    expect(isEmptyExtraction(lead)).toBe(true);
    expect(lead.warnings).toContain('nothing_extracted');
  });

  it('a name alone IS a lead', () => {
    const lead = extractLead({ name: 'Walk In Wanda' }, NOW);
    expect(lead.customerName).toBe('Walk In Wanda');
    expect(isEmptyExtraction(lead)).toBe(false);
    expect(lead.warnings).toEqual([]);
  });

  it('does not throw on a self-referential payload', () => {
    // A malicious or buggy client can send one; a stack overflow here would be a
    // 500 on the public endpoint.
    const payload: Record<string, unknown> = { email: 'loop@example.com' };
    payload.self = payload;
    expect(() => extractLead(payload, NOW)).not.toThrow();
    expect(extractLead(payload, NOW).email).toBe('loop@example.com');
  });
});

describe('extractLead — names and notes', () => {
  it('prefers a full name over a first name alone', () => {
    const lead = extractLead({ first_name: 'Sam', full_name: 'Sam Okafor' }, NOW);
    expect(lead.customerName).toBe('Sam Okafor');
  });

  it('joins first and last when there is no full name', () => {
    const lead = extractLead({ first_name: 'Sam', last_name: 'Okafor' }, NOW);
    expect(lead.customerName).toBe('Sam Okafor');
  });

  it('takes a first name alone when that is all there is', () => {
    expect(extractLead({ first_name: 'Sam' }, NOW).customerName).toBe('Sam');
  });

  it('ignores name-shaped keys that are not a person', () => {
    // `form_name` and `business_name` describe the form and the salon, not the
    // customer, so neither may become a lead's name.
    const lead = extractLead({ form_name: 'Contact us', business_name: 'Sunset Salon' }, NOW);
    expect(lead.customerName).toBeNull();
  });

  it('does not read camelCase `fullName` as a last name', () => {
    // Keys are lowercased before matching, so `fullName` ends in `lname`. An
    // unbounded last-name suffix classifies it as a surname and joins it to the
    // first name, yielding 'Marcus Marcus Webb'.
    const lead = extractLead({ fullName: 'Marcus Webb', firstName: 'Marcus' }, NOW);
    expect(lead.customerName).toBe('Marcus Webb');
  });

  it('does not read Jotform`s q3_fullName as a last name', () => {
    const lead = extractLead(
      { q3_fullName: 'Marcus Webb', q2_firstName: 'Marcus', email: 'x@example.com' },
      NOW,
    );
    expect(lead.customerName).toBe('Marcus Webb');
  });

  it('does not let a middle name masquerade as the full name', () => {
    // Inferring "the full name is whichever candidate is neither first nor last"
    // picks `middle_name` and returns 'Q'.
    const lead = extractLead(
      { first_name: 'Sam', middle_name: 'Q', last_name: 'Okafor' },
      NOW,
    );
    expect(lead.customerName).toBe('Sam Okafor');
  });

  it('does not let an unrelated name-ish key beat first+last', () => {
    // A `pet_name` is name-shaped, is neither first nor last, and would win
    // outright under exclusion-based inference.
    const lead = extractLead(
      { first_name: 'Sam', last_name: 'Okafor', pet_name: 'Biscuit' },
      NOW,
    );
    expect(lead.customerName).toBe('Sam Okafor');
  });

  it('does not treat a boolean flag under a name-ish key as a name', () => {
    // `name_verified: true` stringifies to 'true'. As a customerName it defeats
    // isEmptyExtraction, so a payload with no contact point and no human name
    // still creates an un-dedupable lead row.
    const lead = extractLead({ name_verified: true }, NOW);
    expect(lead.customerName).toBeNull();
    expect(isEmptyExtraction(lead)).toBe(true);
    expect(lead.warnings).toContain('nothing_extracted');
  });

  it('does not treat an all-digit value under a name-ish key as a name', () => {
    const lead = extractLead({ name_id: 40199 }, NOW);
    expect(lead.customerName).toBeNull();
    expect(isEmptyExtraction(lead)).toBe(true);
  });

  it('truncates notes at 2000 characters', () => {
    const lead = extractLead({ email: 'x@example.com', message: 'a'.repeat(2500) }, NOW);
    expect(lead.notes).toHaveLength(2000);
  });

  it.each([['message'], ['comments'], ['note'], ['enquiry'], ['inquiry'], ['details'], ['description']])(
    'reads notes from `%s`',
    (key) => {
      expect(extractLead({ email: 'x@example.com', [key]: 'Friday please' }, NOW).notes).toBe(
        'Friday please',
      );
    },
  );

  it('trims whitespace and treats a blank value as absent', () => {
    const lead = extractLead({ name: '  Sam Okafor  ', message: '   ' }, NOW);
    expect(lead.customerName).toBe('Sam Okafor');
    expect(lead.notes).toBeNull();
  });
});

describe('extractLead — provider event id', () => {
  it.each([['id'], ['event_id'], ['submission_id'], ['response_id'], ['form_response_id']])(
    'reads `%s`',
    (key) => {
      expect(extractLead({ [key]: 'abc123', email: 'x@example.com' }, NOW).providerEventId).toBe(
        'abc123',
      );
    },
  );

  it('finds an id nested at depth', () => {
    const lead = extractLead({ data: { form_response: { id: 'nested-1' } } }, NOW);
    expect(lead.providerEventId).toBe('nested-1');
  });

  it('ignores ids that are not the delivery\'s own', () => {
    // form_id and user_id are stable across every submission. Using either as
    // the dedupe key would make the second real lead look like a retry of the
    // first and silently discard it.
    const lead = extractLead({ form_id: 'aB3xY', user_id: 'u_99', email: 'x@example.com' }, NOW);
    expect(lead.providerEventId).toBeNull();
  });

  it.each([
    ['form', { form: { id: 'aB3xY' } }],
    ['user', { user: { id: 'u_99' } }],
    ['account', { account: { id: 'acct_7' } }],
    ['organization', { organization: { id: 'org_3' } }],
  ])('ignores a stable `%s.id` nested one level down', (_label, nested) => {
    // flatten keeps only the final path segment, so `{user: {id}}` arrives as a
    // bare `id` and matches the exact key list. That id is stable across every
    // submission from that form or user, so buildDedupeKey would treat the second
    // real lead as a retry of the first and silently discard it.
    const lead = extractLead({ ...nested, email: 'x@example.com' }, NOW);
    expect(lead.providerEventId).toBeNull();
  });

  it('still reads a delivery id nested under a neutral parent', () => {
    // Negative control for the rule above: only form/user/account/organization
    // parents are stable. `data.form_response.id` is per-delivery.
    const lead = extractLead({ data: { form_response: { id: 'nested-1' } } }, NOW);
    expect(lead.providerEventId).toBe('nested-1');
  });

  it('stringifies a numeric id', () => {
    expect(extractLead({ submission_id: 5820119 }, NOW).providerEventId).toBe('5820119');
  });

  it('never returns an empty string', () => {
    // buildDedupeKey treats a falsy providerEventId as absent and hashes the
    // payload instead; returning '' would depend on that coincidence.
    expect(extractLead({ id: '   ' }, NOW).providerEventId).toBeNull();
  });
});

describe('extractLead — arrays of question/answer pairs', () => {
  it('reads a label/value pair shape', () => {
    const lead = extractLead(
      {
        fields: [
          { label: 'Your email', value: 'pair@example.com' },
          { label: 'Phone', value: '555 314 1592' },
          { label: 'Additional details', value: 'Saturday morning' },
        ],
      },
      NOW,
    );
    expect(lead.email).toBe('pair@example.com');
    expect(lead.phone).toBe('5553141592');
    expect(lead.notes).toBe('Saturday morning');
  });

  it('does not let a question label supply the answer', () => {
    // The label is the form's wording, never the customer's data. The label must
    // be a BARE address: with surrounding prose normalizeEmail rejects it on the
    // spaces alone, so the fixture would pass even with the label special-case
    // deleted and could never fail.
    const lead = extractLead(
      { fields: [{ label: 'hello@sunsetsalon.com', value: 'real@example.com' }] },
      NOW,
    );
    expect(lead.email).toBe('real@example.com');
    expect(lead.warnings).toEqual([]);
  });
});
