-- Tracks the confirmation email sent to the person who submitted a lead.
ALTER TABLE "leads"
  ADD COLUMN "confirmation_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN "confirmation_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmation_error" VARCHAR(500);

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_confirmation_attempts_nonnegative" CHECK ("confirmation_attempts" >= 0),
  ADD CONSTRAINT "leads_confirmation_needs_email" CHECK ("confirmation_sent_at" IS NULL OR "email" IS NOT NULL);
