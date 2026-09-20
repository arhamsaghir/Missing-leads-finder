import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { LEAD_STATUSES } from '@missed-lead/core';
import { customers } from './customers';
import { tenantPolicy } from './tenancy';

/** Generated from the engine's status list so the two can never drift. */
export const leadStatus = pgEnum('lead_status', LEAD_STATUSES);

export const sourceKind = pgEnum('source_kind', ['webhook', 'email', 'csv']);

/**
 * A configured way leads arrive: a webhook URL, a forwarding address, or a CSV
 * upload. One customer can have several.
 */
export const leadSources = pgTable(
  'lead_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    kind: sourceKind('kind').notNull(),
    label: text('label').notNull(),
    /** High-entropy secret embedded in the webhook URL. */
    webhookToken: text('webhook_token').unique(),
    /** Previous token, honoured during rotation so a customer's form does not
     *  break the moment they rotate. */
    webhookTokenPrevious: text('webhook_token_previous').unique(),
    inboundAddress: text('inbound_address').unique(),
    /** When webhookTokenPrevious was demoted. The overlap window is measured
     *  from here, so a rotation cannot leave an old token live forever. A null
     *  value means the window's start is unknown, and ingest_admit fails closed
     *  rather than honouring an unbounded one. */
    tokenRotatedAt: timestamp('token_rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('lead_sources_customer_idx').on(t.customerId),
    tenantPolicy('lead_sources_tenant_isolation'),
  ],
);

/**
 * A lead. Mirrors the `Lead` type in @missed-lead/core with three deliberate
 * differences:
 *
 * 1. `contact` is split into `email`/`phone`. The in-memory type keeps one
 *    polymorphic field; you cannot reliably dedupe on that, and dedupe is what
 *    stops the same person being counted twice. Hydration sets
 *    `contact = email ?? phone`.
 * 2. A surrogate uuid PK replaces `lead_id`, which falls back to a positional
 *    `row-${i}` and collides across imports. The source's own id is kept as
 *    `externalLeadId`.
 * 3. `row_errors`/`row_warnings` live on lead_events — they describe an import,
 *    not a lead.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => leadSources.id, { onDelete: 'set null' }),
    /** The originating system's identifier, when it has one. */
    externalLeadId: text('external_lead_id'),

    /** When the lead arrived — not when we ingested it. Drives every leak rule. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    customerName: text('customer_name').notNull().default('Unknown'),

    email: text('email'),
    phone: text('phone'),

    source: text('source').notNull().default('Manual'),
    status: leadStatus('status').notNull().default('new'),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),

    /** Integer cents. Never a float — money in floats silently drifts. */
    estimatedValue: integer('estimated_value').notNull().default(25000),
    notes: text('notes').notNull().default(''),

    /** Set when this lead was merged into another; the survivor keeps the data. */
    mergedIntoLeadId: uuid('merged_into_lead_id').references((): AnyPgColumn => leads.id, {
      onDelete: 'set null',
    }),

    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('leads_customer_created_idx').on(t.customerId, t.createdAt.desc()),
    index('leads_customer_status_idx').on(t.customerId, t.status),
    // Only one lead per external id per source — a redelivered webhook that
    // carries the provider's id updates rather than duplicates.
    unique('leads_source_external_id_key').on(t.sourceId, t.externalLeadId),
    tenantPolicy('leads_tenant_isolation'),
  ],
);

export const identityKind = pgEnum('identity_kind', ['email', 'phone']);

/**
 * Dedupe mechanism #1 of 2 — identity.
 *
 * A lead can be reachable several ways, and the same person can arrive through
 * a web form AND a forwarded email. On ingest we normalize the contact, look it
 * up here, and merge onto the existing lead when it matches. Without this, one
 * human becomes two leads and their lost revenue is counted twice.
 *
 * The unique key is scoped per customer: two different businesses can both have
 * a lead with the same phone number, and those are genuinely different people
 * to them.
 */
export const leadIdentities = pgTable(
  'lead_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    kind: identityKind('kind').notNull(),
    /** Canonical form from @missed-lead/core's normalize functions. */
    valueNormalized: text('value_normalized').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lead_identities_customer_value_key').on(t.customerId, t.kind, t.valueNormalized),
    index('lead_identities_lead_idx').on(t.leadId),
    tenantPolicy('lead_identities_tenant_isolation'),
  ],
);

/**
 * Dedupe mechanism #2 of 2 — idempotency, plus the audit trail.
 *
 * Typeform retries on timeout and Calendly redelivers, so the same payload
 * arrives more than once. `dedupeKey` is a hash of the source plus the
 * provider's event id (or the canonical payload when there is none); the unique
 * constraint makes a repeat delivery a no-op instead of a second lead.
 *
 * Import diagnostics live here rather than on `leads` because they describe one
 * ingest attempt.
 */
export const leadEvents = pgTable(
  'lead_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => leadSources.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    rawPayload: jsonb('raw_payload'),
    parseErrors: jsonb('parse_errors').notNull().default(sql`'[]'::jsonb`),
    parseWarnings: jsonb('parse_warnings').notNull().default(sql`'[]'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lead_events_customer_dedupe_key').on(t.customerId, t.dedupeKey),
    index('lead_events_customer_lead_idx').on(t.customerId, t.leadId, t.occurredAt.desc()),
    tenantPolicy('lead_events_tenant_isolation'),
  ],
);

export const leadsRelations = relations(leads, ({ many, one }) => ({
  identities: many(leadIdentities),
  events: many(leadEvents),
  source: one(leadSources, { fields: [leads.sourceId], references: [leadSources.id] }),
}));

export const leadIdentitiesRelations = relations(leadIdentities, ({ one }) => ({
  lead: one(leads, { fields: [leadIdentities.leadId], references: [leads.id] }),
}));

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadIdentity = typeof leadIdentities.$inferSelect;
export type LeadEvent = typeof leadEvents.$inferSelect;
export type NewLeadEvent = typeof leadEvents.$inferInsert;
export type LeadSource = typeof leadSources.$inferSelect;
