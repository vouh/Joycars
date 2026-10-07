# Vehicle viewing and M-Pesa

Five sample vehicles are stored in PostgreSQL, with attributed Wikimedia Commons photos uploaded to the configured Supabase image bucket. Run `node node_modules/tsx/dist/cli.mjs scripts/seed-sample-vehicles.ts` to add them safely again; stable external IDs prevent duplicate stock. Sample descriptions make clear that these are representative listings.

The vehicle image, title and Book viewing button navigate to `/vehicles/[slug]`. The dedicated page displays full specifications, photos and a viewing request form. Submission saves the request and its delivery record transactionally; the admin sees it in `/admin` with customer details, selected vehicle, Nairobi viewing time, payment status and email status.

The initial viewing fee is KES 5, stored in `booking_settings`. Active administrators can change it from the admin inbox. Existing payment amounts do not change. The checkout rejects a stale displayed fee rather than charging a changed amount unexpectedly.

M-Pesa STK Push uses the existing server-side Daraja client. Requests are saved before payment. Pending/paid payment deduplication, polling, retries, provider status queries and callback reconciliation are supported. Successful callbacks are checked against Daraja before issuing a payment receipt. Booking confirmation and paid receipt emails use Resend with idempotency keys and bounded retries. Schedule `/api/cron/deliver-leads` with the configured bearer secret for retry/reconciliation work.

## Complete payment setup on Vercel

Set `MPESA_CALLBACK_BASE_URL` to the public HTTPS origin of the deployed application (for example `https://your-project.vercel.app`), without adding an endpoint path. Keep `MPESA_CALLBACK_SECRET` as a long random server secret. The application derives the full callback path `/api/payments/callback/<secret>` internally. Never expose that secret in client code or commit it. Localhost cannot receive Safaricom callbacks, so live payment is deliberately unavailable until a public HTTPS origin is configured.

Set `APP_URL` to the deployed origin for auth redirects. Carry the configured database, Supabase, Resend and Daraja environment variables into Vercel. Email requires a verified sender, `RESEND_API_KEY`, and `EMAIL_FROM` or `RESEND_FROM_EMAIL`. `MPESA_ENV` selects sandbox versus production credentials; do not use production for automated payment tests. Customers enter their M-Pesa PIN only on their phone.

Development: `npm run dev` serves the full application on port 3004. Production and development use separate build folders. The old `ui-preview` folder is retained as a historical preview and is no longer the active application.

## Validation

TypeScript validation and the automated suite cover request validation, Nairobi time, Daraja formatting/parsing/client behavior, retry backoff and escaped confirmation/receipt emails. Check a sample vehicle detail page and an authenticated admin account before launch. `scripts/check-booking-flow.ts` is an explicitly invoked diagnostic that records a test booking and sends its confirmation to `RESEND_TEST_EMAIL`; it refuses to run when a live callback origin is configured.
