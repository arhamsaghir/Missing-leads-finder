import { extractLead, isEmptyExtraction } from '@missed-lead/core';
import {
  buildDedupeKey,
  findExistingEvent,
  PREVIOUS_TOKEN_EVENT,
  recordLeadEvent,
  type TokenState,
  upsertLead,
  withIngestScope,
} from '@missed-lead/db';
import { db } from './db';

/**
 * Shared ingest orchestration: extract → write, inside one tenant-scoped
 * transaction. Admission has already happened by the time anything here runs.
 *
 * Phase 3's email path calls `ingestDelivery` with a parsed message instead of a
 * webhook body, which is why this is not inline in the route file.
 */

export type IngestOutcome =
  | { kind: 'created'; leadId: string }
  | { kind: 'deduped' }
  | { kind: 'unparsed' };

/**
 * The caller's IP, from Vercel's `x-forwarded-for`.
 *
 * First entry only: the platform appends the real peer address, and a client
 * cannot forge one in a way that reaches us unchanged. Null when the header is
 * absent (a local test invocation), which makes `ingest_admit` skip the IP
 * buckets rather than key every caller onto one shared placeholder.
 */
export function clientIp(req: Request): string | null {
  const header = req.headers.get('x-forwarded-for');
  if (!header) return null;
  const first = header.split(',')[0]?.trim();
  return first || null;
}

/**
 * Read the body as JSON, or as a form post flattened to one level.
 *
 * Form-encoded is accepted because several form tools send it by default;
 * rejecting them would fail in the field for a reason the owner could never
 * diagnose. Anything else, or a body that will not parse, is a 400 — and
 * deliberately writes no event, because a request we cannot parse has no dedupe
 * key and a malformed-body loop would fill the audit log.
 */
export async function parseBody(
  req: Request,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  // Strip any `; charset=utf-8` parameter before comparing.
  const type = (req.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  const raw = await req.text();
  if (!raw) return { ok: false };

  if (type === 'application/json') {
    try {
      return { ok: true, payload: JSON.parse(raw) };
    } catch {
      return { ok: false };
    }
  }

  if (type === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(raw);
    const flat = Object.fromEntries(params);
    if (Object.keys(flat).length === 0) return { ok: false };
    return { ok: true, payload: flat };
  }

  return { ok: false };
}

/**
 * Extract the payload and write it, or report that there was nothing to write.
 *
 * Write order is fixed by privilege: `ingest_role` holds only SELECT and INSERT
 * on lead_events (`0001_ingest_role.sql:81`), no UPDATE, so an event cannot be
 * inserted first and have its lead_id backfilled. Lead, then event.
 *
 * On a repeat delivery the whole transaction is rolled back rather than letting
 * the redundant upsert commit. Harmless today, since mergeLeadFields is monotonic
 * and idempotent — but committing it would make correctness depend on that
 * property holding forever.
 */
export async function ingestDelivery(input: {
  customerId: string;
  sourceId: string;
  payload: unknown;
  tokenState: TokenState;
  now?: Date;
}): Promise<IngestOutcome> {
  const receivedAt = input.now ?? new Date();
  const extracted = extractLead(input.payload, receivedAt);
  const dedupeKey = buildDedupeKey({
    sourceId: input.sourceId,
    providerEventId: extracted.providerEventId,
    payload: input.payload,
  });

  /** Thrown to roll transaction 2 back on a repeat delivery. */
  class Deduped extends Error {}

  try {
    return await withIngestScope(db(), input.customerId, async (tx) => {
      // Cheap read first: the common retry case short-circuits before any write
      // and never reaches the rollback path.
      if (await findExistingEvent(tx, input.customerId, dedupeKey)) throw new Deduped();

      const warnings = extracted.warnings;

      if (isEmptyExtraction(extracted)) {
        // raw_payload is stored regardless. Never a rejection — an owner
        // debugging a misconfigured form needs to see that we received
        // something.
        await recordLeadEvent(tx, input.customerId, {
          kind: 'webhook.received',
          dedupeKey,
          sourceId: input.sourceId,
          rawPayload: input.payload,
          parseWarnings: warnings,
          occurredAt: receivedAt,
        });
        if (input.tokenState === 'previous') {
          await recordPreviousTokenUse(tx, input.customerId, input.sourceId, dedupeKey, receivedAt);
        }
        return { kind: 'unparsed' as const };
      }

      const lead = await upsertLead(tx, input.customerId, {
        sourceId: input.sourceId,
        externalLeadId: extracted.providerEventId,
        // Out-of-window timestamps fall back to receipt time; the warning is
        // already on the event.
        createdAt: extracted.occurredAt ?? receivedAt,
        ...(extracted.customerName ? { customerName: extracted.customerName } : {}),
        email: extracted.email,
        phone: extracted.phone,
        source: 'Webhook',
        ...(extracted.notes ? { notes: extracted.notes } : {}),
      });

      const recorded = await recordLeadEvent(tx, input.customerId, {
        kind: 'webhook.received',
        dedupeKey,
        leadId: lead.leadId,
        sourceId: input.sourceId,
        rawPayload: input.payload,
        parseWarnings: warnings,
        occurredAt: receivedAt,
      });

      // Two concurrent retries: the SELECT above can miss, and the unique
      // constraint on (customer_id, dedupe_key) resolves it here rather than by
      // timing.
      if (!recorded.recorded) throw new Deduped();

      if (input.tokenState === 'previous') {
        await recordPreviousTokenUse(tx, input.customerId, input.sourceId, dedupeKey, receivedAt);
      }

      return { kind: 'created' as const, leadId: lead.leadId };
    });
  } catch (error) {
    if (error instanceof Deduped) return { kind: 'deduped' };
    throw error;
  }
}

/**
 * Note that a delivery arrived on the demoted token.
 *
 * This row is what lets the status endpoint tell an owner "your old URL is still
 * being used" — the alert `PITFALLS.md:12` asks for. Its dedupe key is derived
 * from the delivery's, so a retry does not log the alert twice.
 */
async function recordPreviousTokenUse(
  tx: Parameters<Parameters<typeof withIngestScope>[2]>[0],
  customerId: string,
  sourceId: string,
  dedupeKey: string,
  occurredAt: Date,
): Promise<void> {
  await recordLeadEvent(tx, customerId, {
    kind: PREVIOUS_TOKEN_EVENT,
    dedupeKey: `${PREVIOUS_TOKEN_EVENT}:${dedupeKey}`,
    sourceId,
    occurredAt,
  });
}
