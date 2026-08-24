import { eq } from 'drizzle-orm';
import { customers, detectionSettings } from '@missed-lead/db';
import { resolveCustomer } from './_lib/auth';
import { db } from './_lib/db';
import { json, methodNotAllowed, problem } from './_lib/response';

/**
 * The signed-in owner's tenant. Proves the whole chain end to end: Supabase
 * session -> verified JWT -> customer_id -> tenant-scoped read.
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await resolveCustomer(req);
  if (!auth.ok) return problem(auth.status, auth.code);

  const [customer] = await db()
    .select({
      id: customers.id,
      businessName: customers.businessName,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(eq(customers.id, auth.customerId))
    .limit(1);

  if (!customer) return problem(403, 'no_customer');

  const [settings] = await db()
    .select({
      slowReplyHours: detectionSettings.slowReplyHours,
      staleQuoteDays: detectionSettings.staleQuoteDays,
      defaultAverageTicket: detectionSettings.defaultAverageTicket,
    })
    .from(detectionSettings)
    .where(eq(detectionSettings.customerId, auth.customerId))
    .limit(1);

  return json({
    customerId: customer.id,
    businessName: customer.businessName,
    createdAt: customer.createdAt,
    // Null when the owner has never saved settings; the engine defaults apply.
    detectionSettings: settings ?? null,
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed(['GET']);
  return GET(req);
}
