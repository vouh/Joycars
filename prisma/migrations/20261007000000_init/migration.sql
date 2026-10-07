-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "publication_state" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "availability" AS ENUM ('available', 'reserved', 'sold');

-- CreateEnum
CREATE TYPE "fuel_type" AS ENUM ('petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'other');

-- CreateEnum
CREATE TYPE "transmission" AS ENUM ('automatic', 'manual');

-- CreateEnum
CREATE TYPE "lead_type" AS ENUM ('enquiry', 'viewing');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('website');

-- CreateEnum
CREATE TYPE "delivery_state" AS ENUM ('pending', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('staff', 'admin');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phone" VARCHAR(32),
    "hours" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "external_id" VARCHAR(100),
    "slug" VARCHAR(120) NOT NULL,
    "make" VARCHAR(60) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "year" SMALLINT,
    "price_amount" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'KES',
    "mileage_km" INTEGER,
    "fuel_type" "fuel_type",
    "transmission" "transmission",
    "location_id" UUID,
    "description" VARCHAR(5000),
    "publication_state" "publication_state" NOT NULL DEFAULT 'draft',
    "availability" "availability" NOT NULL DEFAULT 'available',
    "published_at" TIMESTAMPTZ(3),
    "sold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_slug_redirects" (
    "slug" VARCHAR(120) NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_slug_redirects_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "vehicle_images" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "alt_text" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID,
    "type" "lead_type" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(254),
    "message" VARCHAR(2000),
    "preferred_viewing_at" TIMESTAMPTZ(3),
    "source" "lead_source" NOT NULL DEFAULT 'website',
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "utm_content" VARCHAR(100),
    "utm_term" VARCHAR(100),
    "idempotency_key" UUID NOT NULL,
    "upstream_id" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_deliveries" (
    "lead_id" UUID NOT NULL,
    "state" "delivery_state" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(3),
    "last_error" VARCHAR(500),
    "delivered_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_deliveries_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "staff_role" NOT NULL DEFAULT 'staff',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(120) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_external_id_key" ON "vehicles"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_slug_key" ON "vehicles"("slug");

-- CreateIndex
CREATE INDEX "vehicles_publication_state_availability_published_at_id_idx" ON "vehicles"("publication_state", "availability", "published_at" DESC, "id");

-- CreateIndex
CREATE INDEX "vehicles_make_model_idx" ON "vehicles"("make", "model");

-- CreateIndex
CREATE INDEX "vehicles_price_amount_id_idx" ON "vehicles"("price_amount", "id");

-- CreateIndex
CREATE INDEX "vehicles_year_idx" ON "vehicles"("year");

-- CreateIndex
CREATE INDEX "vehicles_location_id_idx" ON "vehicles"("location_id");

-- CreateIndex
CREATE INDEX "vehicle_slug_redirects_vehicle_id_idx" ON "vehicle_slug_redirects"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_images_storage_key_key" ON "vehicle_images"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_images_vehicle_id_position_key" ON "vehicle_images"("vehicle_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "leads_idempotency_key_key" ON "leads"("idempotency_key");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_vehicle_id_idx" ON "leads"("vehicle_id");

-- CreateIndex
CREATE INDEX "lead_deliveries_state_next_attempt_at_idx" ON "lead_deliveries"("state", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_auth_user_id_key" ON "staff_profiles"("auth_user_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_slug_redirects" ADD CONSTRAINT "vehicle_slug_redirects_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_deliveries" ADD CONSTRAINT "lead_deliveries_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma cannot express (see ARCHITECTURE.md). Keep in sync
-- with the application validation in lib/validation and lib/services.
-- ---------------------------------------------------------------------------

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "vehicles_price_nonnegative" CHECK ("price_amount" IS NULL OR "price_amount" >= 0),
  ADD CONSTRAINT "vehicles_mileage_nonnegative" CHECK ("mileage_km" IS NULL OR "mileage_km" >= 0),
  ADD CONSTRAINT "vehicles_year_range" CHECK ("year" IS NULL OR "year" BETWEEN 1950 AND 2100),
  ADD CONSTRAINT "vehicles_currency_kes" CHECK ("currency" = 'KES'),
  ADD CONSTRAINT "vehicles_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "vehicles_sold_timestamp" CHECK (("availability" = 'sold') = ("sold_at" IS NOT NULL)),
  -- A published listing must carry every public specification.
  ADD CONSTRAINT "vehicles_published_complete" CHECK (
    "publication_state" <> 'published' OR (
      "year" IS NOT NULL AND "price_amount" IS NOT NULL AND "mileage_km" IS NOT NULL AND
      "fuel_type" IS NOT NULL AND "transmission" IS NOT NULL AND "location_id" IS NOT NULL AND
      "description" IS NOT NULL AND "published_at" IS NOT NULL
    )
  );

ALTER TABLE "vehicle_images"
  ADD CONSTRAINT "vehicle_images_position_nonnegative" CHECK ("position" >= 0),
  ADD CONSTRAINT "vehicle_images_dimensions_positive" CHECK ("width" > 0 AND "height" > 0 AND "bytes" > 0);

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_viewing_has_time" CHECK ("type" <> 'viewing' OR "preferred_viewing_at" IS NOT NULL),
  ADD CONSTRAINT "leads_phone_e164" CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "lead_deliveries"
  ADD CONSTRAINT "lead_deliveries_attempts_nonnegative" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "lead_deliveries_delivered_timestamp" CHECK (("state" = 'delivered') = ("delivered_at" IS NOT NULL));

ALTER TABLE "rate_limit_buckets"
  ADD CONSTRAINT "rate_limit_buckets_count_positive" CHECK ("count" >= 1);

-- ---------------------------------------------------------------------------
-- Supabase exposes the public schema through its Data API. All access goes
-- through the Next.js server (Prisma connects as the table owner, which
-- bypasses RLS), so enable RLS with no policies: anon/authenticated API keys
-- can read or write nothing.
-- ---------------------------------------------------------------------------

ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_slug_redirects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
