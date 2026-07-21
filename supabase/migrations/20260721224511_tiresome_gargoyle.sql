CREATE TYPE "public"."company_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."contributor_type" AS ENUM('employer', 'self_employed', 'voluntary_social_insurance', 'domestic_service');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nif" text,
	"status" "team_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"niss" bigint NOT NULL,
	"nif" varchar(9),
	"name" text NOT NULL,
	"type" "contributor_type" NOT NULL,
	"status" "company_status" DEFAULT 'active' NOT NULL,
	"email" text,
	"phone" varchar(20),
	"address_line1" text,
	"address_line2" text,
	"postal_code" varchar(10),
	"city" text,
	"country" varchar(2) DEFAULT 'PT' NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_niss_uq" UNIQUE("niss")
);
--> statement-breakpoint
-- Ordem ajustada à mão: derruba as FKs para `clients` ANTES de dropar a tabela
-- (senão o DROP TABLE ... CASCADE já as remove e o DROP CONSTRAINT falharia).
ALTER TABLE "integration_credentials" DROP CONSTRAINT IF EXISTS "integration_credentials_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "obligations" DROP CONSTRAINT IF EXISTS "obligations_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "clients" CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_niss_idx" ON "companies" USING btree ("niss");--> statement-breakpoint
CREATE INDEX "company_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "company_team_idx" ON "companies" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "obligations" DROP COLUMN "client_id";--> statement-breakpoint
DROP TYPE "public"."client_status";