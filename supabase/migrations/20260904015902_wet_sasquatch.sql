ALTER TABLE "jobs" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_company_latest_idx" ON "jobs" USING btree ("team_id","type","company_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_company_inflight_uq" ON "jobs" USING btree ("company_id","type") WHERE "jobs"."status" in ('pending','running');--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_period_type_uq" UNIQUE("obligation_period_id","type");--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligation_company_kind_uq" UNIQUE("company_id","kind");