ALTER TABLE "companies" ALTER COLUMN "niss" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "toconline_company_id" bigint;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "toconline_cluster" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "toconline_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_team_idx" ON "jobs" USING btree ("team_id","type","status");--> statement-breakpoint
CREATE INDEX "company_nif_idx" ON "companies" USING btree ("nif");--> statement-breakpoint
CREATE INDEX "company_toconline_idx" ON "companies" USING btree ("toconline_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_team_provider_uq" ON "integration_credentials" USING btree ("team_id","provider") WHERE "integration_credentials"."company_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "credential_company_provider_uq" ON "integration_credentials" USING btree ("company_id","provider") WHERE "integration_credentials"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "credential_team_idx" ON "integration_credentials" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "company_nif_team_uq" UNIQUE("team_id","nif");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "company_toconline_team_uq" UNIQUE("team_id","toconline_company_id");