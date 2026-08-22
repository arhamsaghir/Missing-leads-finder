# Missed Lead Revenue Finder

A narrow, audit-first tool for local service businesses to find missed revenue from lead leaks.

## What it does

Paste or upload a CSV of your leads, and the app instantly shows:

- **Potential Missed Revenue** — estimated dollars from leads with no reply, slow reply, no follow-up, or stale quotes
- **Contacted Revenue at Risk** — dollars from contacted/quoted leads with no scheduled follow-up
- **Confirmed Recovered Revenue** — dollars from leads explicitly marked as recovered/booked
- **Leak breakdown** — counts by category (no reply, slow reply, no follow-up, stale quote)
- **Lead table** — every lead with its leak flags
- **Recovery templates** — copy-paste message drafts for each leak type

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **Load sample data**, then **Analyze**.

## CSV format

Required columns (case-insensitive, aliases accepted):

| Canonical | Aliases |
|-----------|---------|
| `lead_id` | `id`, `lead id`, `leadId` |
| `created_at` | `created`, `date`, `submitted_at`, `lead date`, `received_at` |
| `customer_name` | `name`, `customer`, `client`, `full name` |
| `contact` | `email`, `phone`, `mobile`, `contact info` |
| `source` | `channel`, `lead source`, `campaign` |
| `status` | `stage`, `pipeline stage`, `outcome` |
| `last_contact_at` | `last contact`, `replied_at`, `contacted_at`, `last_reply_at` |
| `next_follow_up_at` | `follow up`, `follow_up_at`, `next step date` |
| `estimated_value` | `value`, `deal value`, `quote amount`, `ticket`, `revenue` |
| `notes` | `note`, `comments`, `message`, `request` |

Status values: `new`, `contacted`, `qualified`, `booked`, `lost`, `recovered`, `won` (unknown → `new` with warning)

Date formats: ISO (`2024-01-15` or `2024-01-15T10:00:00Z`) or US (`01/15/2024`)

Money: plain numbers (`50000`) or currency strings (`$500.00`, `1,250`)

## Leak detection rules

| Leak | Condition |
|------|-----------|
| **No reply** | `last_contact_at` blank AND status not `booked`/`lost`/`recovered`/`won` |
| **Slow reply** | `last_contact_at - created_at > 24h` AND status not terminal |
| **No follow-up** | Status `contacted`/`qualified` AND `next_follow_up_at` blank |
| **Stale quote** | Status `qualified` AND `last_contact_at` older than 7 days |

A lead can have multiple leaks. Unique affected leads are counted once.

## Revenue formulas

- **Lead value** = `estimated_value` or default average ticket (25000¢ = $250)
- **Potential missed revenue** = sum of lead values for unique leads with ≥1 leak, excluding terminal statuses
- **Contacted revenue at risk** = sum for `contacted`/`qualified` leads with a follow-up leak
- **Confirmed recovered revenue** = sum for leads with status `recovered`/`booked`/`won` (explicit only)

All displayed dollar amounts are **estimates** unless backed by explicit recovered/booked status.

## Recovery templates

The app generates draft messages for each leak type:

- **No reply** — initial follow-up after inquiry
- **No follow-up** — check-in after contact/quote
- **Stale quote** — re-engagement on stale quote

Templates are **copy-paste only** — no automated sending. Review and edit before sending.

## Sample data

Click **Load sample data** to see a demo with 6 leads covering all leak types plus one invalid row.

## Limitations (v1)

- No Gmail/CRM/Meta/Google Ads integrations
- No SMS/email sending
- No Stripe/subscriptions/auth
- No AI scoring
- Browser-local processing only
- No database/backend

## Development

```bash
npm test        # run all tests (62 tests)
npm run build   # production build
npm run dev     # dev server
```

## License

MIT