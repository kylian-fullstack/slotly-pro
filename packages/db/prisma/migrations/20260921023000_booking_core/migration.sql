CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_id_organization_id_key" UNIQUE ("id", "organization_id");

CREATE TABLE "services" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(1000) NOT NULL DEFAULT '',
  "duration_minutes" INTEGER NOT NULL,
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "services_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 720),
  CONSTRAINT "services_price_check" CHECK ("price_cents" BETWEEN 0 AND 100000000),
  CONSTRAINT "services_id_organization_id_key" UNIQUE ("id", "organization_id")
);

CREATE TABLE "service_providers" (
  "organization_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_providers_pkey" PRIMARY KEY ("service_id", "membership_id")
);

CREATE TABLE "availability_rules" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "availability_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "availability_minutes_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute")
);

CREATE TABLE "bookings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "provider_membership_id" UUID NOT NULL,
  "customer_name" VARCHAR(120) NOT NULL,
  "customer_email" VARCHAR(254) NOT NULL,
  "customer_phone" VARCHAR(40),
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "confirmation_code" VARCHAR(24) NOT NULL,
  "cancellation_digest" CHAR(64) NOT NULL,
  "notes" VARCHAR(1000) NOT NULL DEFAULT '',
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bookings_interval_check" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "bookings_confirmation_code_key" UNIQUE ("confirmation_code"),
  CONSTRAINT "bookings_cancellation_digest_key" UNIQUE ("cancellation_digest")
);

ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_service_fkey" FOREIGN KEY ("service_id", "organization_id") REFERENCES "services"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_membership_fkey" FOREIGN KEY ("membership_id", "organization_id") REFERENCES "memberships"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_membership_fkey" FOREIGN KEY ("membership_id", "organization_id") REFERENCES "memberships"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_fkey" FOREIGN KEY ("service_id", "organization_id") REFERENCES "services"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_provider_fkey" FOREIGN KEY ("provider_membership_id", "organization_id") REFERENCES "memberships"("id", "organization_id") ON DELETE RESTRICT;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_provider_overlap" EXCLUDE USING gist (
  "organization_id" WITH =,
  "provider_membership_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" = 'CONFIRMED');

CREATE INDEX "services_organization_id_active_name_idx" ON "services"("organization_id", "active", "name");
CREATE INDEX "service_providers_organization_id_membership_id_active_idx" ON "service_providers"("organization_id", "membership_id", "active");
CREATE INDEX "availability_rules_organization_id_membership_id_weekday_active_idx" ON "availability_rules"("organization_id", "membership_id", "weekday", "active");
CREATE INDEX "bookings_organization_id_starts_at_status_idx" ON "bookings"("organization_id", "starts_at", "status");
CREATE INDEX "bookings_organization_id_provider_membership_id_starts_at_idx" ON "bookings"("organization_id", "provider_membership_id", "starts_at");
CREATE INDEX "bookings_customer_email_created_at_idx" ON "bookings"("customer_email", "created_at" DESC);
