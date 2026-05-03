CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stripe_customer_id" text,
	"trial_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "church_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"church_name" text NOT NULL,
	"denomination" text DEFAULT '' NOT NULL,
	"theology" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"average_attendance" integer,
	"music_style" text DEFAULT '' NOT NULL,
	"traditions" text DEFAULT '' NOT NULL,
	"leader_name" text NOT NULL,
	"leader_role" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "church_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"scripture" text DEFAULT '' NOT NULL,
	"theme" text DEFAULT '' NOT NULL,
	"season" text DEFAULT '' NOT NULL,
	"service_date" timestamp with time zone,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_repertoire" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sermon_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sermon_id" integer NOT NULL,
	"format" text DEFAULT 'markdown' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sermon_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"resource_type" text DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"publisher" text DEFAULT '' NOT NULL,
	"year" text DEFAULT '' NOT NULL,
	"page_or_location" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"related_passage" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sermon_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"big_idea" text DEFAULT '' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"planned_sermon_count" integer,
	"status" text DEFAULT 'planning' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sermons" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"sermon_date" timestamp with time zone,
	"passage" text DEFAULT '' NOT NULL,
	"secondary_passages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme" text DEFAULT '' NOT NULL,
	"series" text DEFAULT '' NOT NULL,
	"series_id" integer,
	"series_order" integer,
	"occasion" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"length" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT '' NOT NULL,
	"style" text DEFAULT '' NOT NULL,
	"depth" text DEFAULT '' NOT NULL,
	"output_format" text DEFAULT 'manuscript' NOT NULL,
	"pastor_notes" text DEFAULT '' NOT NULL,
	"study" jsonb,
	"big_idea" jsonb,
	"outline" jsonb,
	"manuscript" jsonb,
	"applications" jsonb,
	"illustrations" jsonb,
	"conclusion" jsonb,
	"worship_integration" jsonb,
	"small_group_questions" jsonb,
	"section_hashes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attached_resource_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"flow" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowdsource_bpm" (
	"title_normalized" text NOT NULL,
	"artist_normalized" text NOT NULL,
	"bpm_avg" numeric(6, 2) NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crowdsource_bpm_title_normalized_artist_normalized_pk" PRIMARY KEY("title_normalized","artist_normalized")
);
--> statement-breakpoint
CREATE TABLE "pcs_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"organization_id" text,
	"organization_name" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_song_count" integer,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pcs_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "external_song_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"library_item_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"metadata" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "service_templates_user_lower_name_uniq" ON "service_templates" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "external_song_links_source_external_id_idx" ON "external_song_links" USING btree ("source","external_id","user_id");