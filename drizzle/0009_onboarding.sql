CREATE TABLE "onboarding_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"step" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"display_name" text,
	"business_name" text,
	"business_type" text,
	"revenue_range" text,
	"employee_count" integer,
	"city" text,
	"address" text,
	"referral_source" text,
	"coa_draft" jsonb,
	"idempotency_key" text,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"current_step" text DEFAULT 'NAMA' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_messages" ADD CONSTRAINT "onboarding_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_messages_org_idx" ON "onboarding_messages" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_profiles_org_uq" ON "org_profiles" USING btree ("org_id");