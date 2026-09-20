import { index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { DEFAULT_DETECTION_CONFIG } from '@missed-lead/core';
import { customers } from './customers';
import { tenantPolicy } from './tenancy';

/**
 * Per-tenant detection thresholds, fed straight into `detectLeaks`'s
 * DetectionConfig. Defaults mirror DEFAULT_DETECTION_CONFIG so behaviour is
 * unchanged until an owner edits them.
 *
 * One row per customer — customer_id is the primary key.
 */
export const detectionSettings = pgTable(
  'detection_settings',
  {
    customerId: uuid('customer_id')
      .primaryKey()
      .references(() => customers.id, { onDelete: 'cascade' }),
    slowReplyHours: integer('slow_reply_hours')
      .notNull()
      .default(DEFAULT_DETECTION_CONFIG.slowReplyHours),
    staleQuoteDays: integer('stale_quote_days')
      .notNull()
      .default(DEFAULT_DETECTION_CONFIG.staleQuoteDays),
    /** Integer cents, used when a lead has no value of its own. */
    defaultAverageTicket: integer('default_average_ticket').notNull().default(25000),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantPolicy('detection_settings_tenant_isolation')],
);

export const pushPlatform = pgEnum('push_platform', ['expo', 'web']);

/**
 * Devices to notify. Created empty now so the notification phase does not need
 * a tenancy migration later.
 *
 * `lastSeenAt` supports pruning: uninstalled apps leave dead tokens behind and
 * sends against them fail silently.
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    platform: pushPlatform('platform').notNull(),
    /** Expo push token, or the Web Push endpoint URL. */
    token: text('token').notNull(),
    /** Web Push only: keys needed to encrypt a payload for this subscription. */
    p256dh: text('p256dh'),
    auth: text('auth'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('push_tokens_customer_platform_token_key').on(t.customerId, t.platform, t.token),
    index('push_tokens_customer_idx').on(t.customerId),
    tenantPolicy('push_tokens_tenant_isolation'),
  ],
);

export type DetectionSettings = typeof detectionSettings.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
