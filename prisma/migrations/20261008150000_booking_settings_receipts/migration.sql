CREATE TABLE "booking_settings" (
  "id" VARCHAR(30) PRIMARY KEY DEFAULT 'viewing',
  "fee_kes" INTEGER NOT NULL DEFAULT 5 CHECK ("fee_kes" BETWEEN 1 AND 150000),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "booking_settings" ("id", "fee_kes") VALUES ('viewing', 5);
ALTER TABLE "booking_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ADD COLUMN "receipt_email_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN "receipt_email_attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("receipt_email_attempts" >= 0);
