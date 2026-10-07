-- M-Pesa (Daraja STK Push) payments for viewing booking fees.

CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired');
CREATE TYPE "payment_purpose" AS ENUM ('viewing_fee');

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "purpose" "payment_purpose" NOT NULL DEFAULT 'viewing_fee',
    "amount_kes" INTEGER NOT NULL,
    "msisdn" VARCHAR(15) NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "merchant_request_id" VARCHAR(100),
    "checkout_request_id" VARCHAR(100),
    "mpesa_receipt" VARCHAR(30),
    "result_code" INTEGER,
    "result_desc" VARCHAR(300),
    "paid_at" TIMESTAMPTZ(3),
    "last_queried_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_merchant_request_id_key" ON "payments"("merchant_request_id");
CREATE UNIQUE INDEX "payments_checkout_request_id_key" ON "payments"("checkout_request_id");
CREATE UNIQUE INDEX "payments_mpesa_receipt_key" ON "payments"("mpesa_receipt");
CREATE INDEX "payments_lead_id_idx" ON "payments"("lead_id");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

ALTER TABLE "payments" ADD CONSTRAINT "payments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_kes" > 0),
  ADD CONSTRAINT "payments_msisdn_format" CHECK ("msisdn" ~ '^254(7|1)[0-9]{8}$'),
  ADD CONSTRAINT "payments_paid_timestamp" CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL));

-- At most one in-flight or completed fee per booking: prevents double charging
-- from double taps, retries or concurrent requests.
CREATE UNIQUE INDEX "payments_one_active_per_lead" ON "payments"("lead_id") WHERE "status" IN ('pending', 'paid');

-- Not reachable through Supabase's Data API (server-only access via Prisma).
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
