CREATE TYPE "public"."app_role" AS ENUM('admin', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('pending', 'in_progress', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."trace_status" AS ENUM('open', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."trigger_kind" AS ENUM('webhook', 'schedule', 'manual', 'system');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"role" "app_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"parent_event_id" uuid,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"status" "event_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"event_id" uuid,
	"level" "log_level" NOT NULL,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logged_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"root_trigger" "trigger_kind" NOT NULL,
	"trigger_source" text,
	"correlation_key" text,
	"status" "trace_status" DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid,
	"triggering_event_id" uuid,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_trace_id_idx" ON "events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "events_parent_idx" ON "events" USING btree ("parent_event_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_occurred_at_idx" ON "events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "logs_trace_id_idx" ON "logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "logs_event_id_idx" ON "logs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "logs_level_idx" ON "logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "jobs_pending_idx" ON "jobs" USING btree ("status","scheduled_for") WHERE "jobs"."status" = 'pending';