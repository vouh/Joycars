# JoyCars backend

Next.js 15 route handlers + Prisma 7 (PostgreSQL on Supabase) + Supabase Auth/Storage + Zod. Implements the MVP in `ARCHITECTURE.md`: public inventory, durable lead capture with an outbox, and invite-only staff administration. It is deliberately **not** a CRM.

## Setup

1. Create a Supabase project (separate projects or secrets for local, preview and production).
2. Create `.env.local` (Next.js) and `.env` (Prisma CLI and scripts) with the variables below.
3. `npm install` (runs `prisma generate`)
4. `npm run db:migrate` applies `prisma/migrations` (tables, CHECK constraints, RLS lockdown).
5. `BOOTSTRAP_ADMIN_EMAIL=owner@example.com BOOTSTRAP_ADMIN_PASSWORD='12+ characters' npm run bootstrap` creates the `vehicle-images` bucket and the first administrator, who then signs in at `/admin` with that email and password. Re-running it resets that password. Without `BOOTSTRAP_ADMIN_PASSWORD` it sends an invitation link instead.
6. Schedule `GET /api/cron/deliver-leads` every 1–5 minutes with `Authorization: Bearer $CRON_SECRET`. Use your host's cron, or Supabase `pg_cron` + `pg_net`. Vercel Hobby only allows daily crons.

| Variable | Notes |
| --- | --- |
| `APP_URL` | Canonical origin; used for auth redirects, sitemap and CSRF origin checks |
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543), used at runtime |
| `DIRECT_URL` | Session pooler / direct (port 5432), used by migrations |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Staff auth |
| `SUPABASE_SECRET_KEY` | Server-only: storage uploads and staff invites |
| `SUPABASE_IMAGES_BUCKET` | Default `vehicle-images` |
| `CRON_SECRET`, `IP_HASH_SECRET` | Random, 32+ characters |
| `LEAD_DELIVERY_ENABLED` | `true` only in production. Leads are always stored either way |
| `BUSINESS_SYSTEM_LEADS_URL`, `BUSINESS_SYSTEM_API_TOKEN` | Upstream webhook (HTTPS required in production) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Customer confirmation emails via [Resend](https://resend.com). `EMAIL_FROM` like `JoyCars <bookings@your-domain>` on a domain verified in Resend. For testing only, `onboarding@resend.dev` can send to the Resend account's own address. Emails are skipped until both are set. `RESEND_FROM_EMAIL` works as an alternative name |
| `EMAIL_REPLY_TO` | Optional: where customer replies go (e.g. the sales inbox). `RESEND_CONTACT_TO_EMAIL` works as an alternative name |
| `ADMIN_SIGNUP_ENABLED` | Testing only. `true` adds "Create an admin account" to `/admin`, and every account made there is a full administrator. Leave unset (off) on any public deployment |
| `RESEND_TEST_EMAIL` | Optional: recipient for `npm run email:test`, which sends a sample confirmation to check the setup |
| `MPESA_ENV` | `sandbox` or `production` (Daraja) |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` | From the Daraja app with Lipa na M-Pesa Online |
| `MPESA_SHORTCODE` | Short code the passkey belongs to (for a Till, the store / head-office number) |
| `MPESA_TILL_NUMBER` | Buy Goods till that receives the fee (defaults to `MPESA_SHORTCODE`) |
| `MPESA_CALLBACK_SECRET` | Random, 32+ characters; secret path segment of the callback URL |
| `MPESA_CALLBACK_BASE_URL` | Optional public **HTTPS** origin for Safaricom callbacks (defaults to `APP_URL`; use a tunnel when testing locally) |
| `VIEWING_FEE_KES` | Whole-shilling viewing booking fee. M-Pesa stays off until this and every M-Pesa variable above are set |

## Deploying to Vercel

`vercel.json` defines one public service, `app` (this Next.js project: site, `/api/*`, `/admin`, M-Pesa callback). `ui-preview/` is a local sample-data copy and is not deployed (`.vercelignore`). No service bindings are needed: the browser calls `/api/...` on the same domain.

1. `npx vercel link`, then add the environment variables above in the Vercel dashboard (Production). Set `APP_URL` to the production `https://` domain. Leave out `DIRECT_URL`, `MPESA_API_BASE_URL` and `MPESA_CALLBACK_BASE_URL` (the callback uses `APP_URL`). Keep `ADMIN_SIGNUP_ENABLED` unset or `false`.
2. Run migrations from your machine before deploying schema changes: `npm run db:migrate`. The Vercel build only runs `prisma generate`.
3. `npx vercel` (preview) / `npx vercel --prod`.
4. Cron: Vercel calls `/api/cron/deliver-leads` with `Authorization: Bearer $CRON_SECRET`. The Hobby plan allows one run a day, so it runs at 06:00 UTC (09:00 Nairobi). Lead delivery, confirmation emails and M-Pesa results are all attempted immediately when a buyer submits; the cron is only the safety net. On Pro, change the schedule to `*/5 * * * *`.
5. Preview deployments get production env vars only if you add them to Preview too. Keep `LEAD_DELIVERY_ENABLED` and the M-Pesa variables out of Preview so test bookings never reach the business system or charge real phones.

## M-Pesa viewing fee

A viewing request is saved first; then the buyer gets an STK Push (`CustomerBuyGoodsOnline` to the till) on their phone. The booking is never lost if M-Pesa fails.

1. `POST /api/leads` (viewing) → response includes `payment: { paymentId, status: "pending", amountKes, message }`, or `{ status: "not_started", message }` if the prompt couldn't be sent (e.g. non-Safaricom number).
2. The page polls `GET /api/payments/{paymentId}` every few seconds until `paid`, `cancelled`, `expired` or `failed`.
3. To retry or pay from another number: `POST /api/leads/{leadId}/payment` with optional `{ "phone": "07…" }`.
4. Safaricom calls `POST /api/payments/callback/{MPESA_CALLBACK_SECRET}`. Daraja callbacks are unsigned: the secret path, a matching `CheckoutRequestID` and the expected amount are all required.
5. If no callback arrives, the status poll and the cron job query M-Pesa (`stkpushquery`) after 45 s; after 15 min an unconfirmed prompt is marked expired. A late success still records the payment. A second completed payment for the same booking is flagged `DUPLICATE PAYMENT — refund required`.

A partial unique index allows only one pending-or-paid fee per booking, so double taps and retries can't charge twice. Staff see payment status and the M-Pesa receipt in the enquiry inbox and the CSV export.

Scripts: `npm run dev | build | typecheck | test | db:migrate | db:migrate:dev | db:studio | bootstrap`.

## Layout

```
prisma/schema.prisma            data model (ARCHITECTURE.md → Logical data model)
prisma/migrations/              SQL incl. CHECK constraints + RLS (keep in sync with schema)
lib/validation/                 Zod schemas for every input (shared with future UI forms)
lib/services/                   business rules; route handlers stay thin
lib/integrations/business-system.ts   upstream lead adapter (versioned payload)
lib/auth.ts                     requireStaff(): server-side role + active checks
lib/http.ts                     safe error mapping, CSRF origin check, body limits
app/api/**                      route handlers
```

## API

Public (cached, with tag invalidation on every staff change):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/vehicles` | Search `q, minPrice, maxPrice, minYear, maxYear, fuel, transmission, location, sort=newest\|price_asc\|price_desc, page, pageSize≤48`. Available and reserved only |
| GET | `/api/vehicles/[slug]` | Detail (sold stays visible with `actions.requestViewing=false` and alternatives). Old slugs return 308 |
| GET | `/api/search-facets` | Makes, price and year ranges from real stock |
| GET | `/api/locations` | Yards |
| POST | `/api/leads` | Enquiry or viewing request (JSON or HTML form). Body: `idempotencyKey` (client UUID, reused on retry), `type`, `vehicleId?`, `name`, `phone`, `email` (required for viewings, optional for enquiries), `message?`, `preferredViewingTime` (`YYYY-MM-DDTHH:mm` Nairobi, for viewings), `utm*?`, `website` (hidden honeypot, leave empty). Returns 201 after commit; 200 + `duplicate:true` on replay; 409 `vehicle_sold` with alternatives; 422 field errors; 429 rate limit |

Staff (Supabase session cookie; every handler checks an **active** `StaffProfile`; mutations require same-origin):

| Method | Path | Purpose |
| --- | --- | --- |
| — | `/admin` | Staff sign-in page and bookings dashboard (viewing requests, upcoming viewings, enquiries, CSV download, confirmation email and delivery status) |
| POST | `/api/auth/password-sign-in` | `{email, password}`. Only active staff profiles get a session |
| POST | `/api/auth/sign-in` · `/api/auth/sign-out` | Email link sign-in (never creates users) |
| GET | `/auth/confirm` | Invite / magic-link landing |
| GET | `/api/admin/me` · `/api/admin/health` | Current staff · delivery backlog/failures |
| GET/POST | `/api/admin/vehicles` | List/search · create draft |
| GET/PATCH/DELETE | `/api/admin/vehicles/[id]` | PATCH needs `version` (409 on conflict). DELETE only for unpublished, never-enquired cars |
| POST | `/api/admin/vehicles/[id]/publication` | `{version, publicationState}`. Publishing requires all specs, location, description and ≥1 photo |
| POST | `/api/admin/vehicles/[id]/availability` | `{version, availability, confirm?, reason?}`. Sold needs `confirm:true`; un-selling needs `reason` |
| POST/PATCH | `/api/admin/vehicles/[id]/images` | Upload (multipart `file`, `altText`) · reorder `{imageIds}` (first = cover) |
| PATCH/DELETE | `/api/admin/vehicles/[id]/images/[imageId]` | Alt text · remove |
| GET | `/api/admin/leads` | Fallback inbox; `?format=csv` export (audited, formula-injection safe) |
| GET · POST | `/api/admin/leads/[id]` · `/retry` | Detail · requeue failed delivery |
| GET/POST, PATCH/DELETE | `/api/admin/locations[/id]` | Writes are admin-only |
| GET/POST, PATCH | `/api/admin/staff[/id]` | Admin only: invite, role, deactivate (last admin protected) |

## Key behaviours

- **Lead reliability:** lead and outbox row are inserted in one transaction. Delivery is attempted right after the response (`after()`) and by cron, with a lease plus `SKIP LOCKED` and exponential backoff (30s→6h, 8 attempts). The lead UUID is sent as `Idempotency-Key`; the receiver must deduplicate. Failures stay in the inbox for staff retry.
- **Confirmation emails:** viewing requests require an email. Whenever a lead has one, the buyer gets a "we received your request" email (never worded as a confirmed booking) after the lead is committed. It is sent from `after()` and retried by the cron job (up to 5 attempts within 23 hours) with `lead-confirmation-{id}` as Resend's idempotency key, so retries can't send duplicates. Email failures never affect the submission, and their status shows in `/admin`.
- **Sold race:** a viewing request takes a `FOR SHARE` lock on the vehicle row, so it serialises against "mark sold".
- **Money:** `price_amount` BIGINT in KES cents. The API takes and returns whole KES.
- **Images:** decoded with sharp (JPEG/PNG/WebP/AVIF only; SVG/GIF/other rejected), ≥640×480, auto-rotated, EXIF/GPS stripped, re-encoded to ≤2000px WebP under a server-generated key.
- **Supabase RLS:** enabled with no policies on every table, so the public Data API exposes nothing. Prisma connects as the owner.
- **Privacy:** logs never include lead bodies or phone numbers. IPs are HMAC-hashed for rate limiting.

## Not done yet / decisions needed

- The admin UI covers sign-in and viewing bookings only. Inventory, photo, location and staff management are still API-only.
- No in-app password change: staff use the email sign-in link, or an admin re-runs bootstrap.
- No staff notification email for new leads (only the buyer's confirmation).
- Upstream business-system contract unconfirmed: `HttpBusinessSystemAdapter` is a generic webhook to adapt.
- Lead retention/deletion period, orphan-upload cleanup job, monitoring/alerting provider, backups/restore test.
