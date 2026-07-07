CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('active', 'expired', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('extracted', 'sent', 'error');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('toconline', 'at', 'seguranca_social', 'efatura');--> statement-breakpoint
CREATE TYPE "public"."obligation_frequency" AS ENUM('monthly', 'quarterly', 'annual', 'other');--> statement-breakpoint
CREATE TYPE "public"."obligation_kind" AS ENUM('iva', 'irs_retencao', 'dmr', 'ss_contribuicoes', 'other');--> statement-breakpoint
CREATE TYPE "public"."obligation_period_status" AS ENUM('pending', 'in_progress', 'delivered', 'paid', 'skipped_nonexistent', 'error', 'not_applicable');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nif" text,
	"email" text,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"toconline_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obligation_period_id" uuid NOT NULL,
	"type" text NOT NULL,
	"entity" text,
	"reference" text,
	"amount" numeric(12, 2),
	"valid_until" date,
	"storage_path" text,
	"status" "document_status" DEFAULT 'extracted' NOT NULL,
	"extracted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"provider" "integration_provider" NOT NULL,
	"username" text,
	"secret_encrypted" text,
	"status" "credential_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligation_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obligation_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" "obligation_period_status" DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligation_period_uq" UNIQUE("obligation_id","period")
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "obligation_kind" NOT NULL,
	"frequency" "obligation_frequency" DEFAULT 'monthly' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_obligation_period_id_obligation_periods_id_fk" FOREIGN KEY ("obligation_period_id") REFERENCES "public"."obligation_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_periods" ADD CONSTRAINT "obligation_periods_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;