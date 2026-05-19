CREATE TABLE IF NOT EXISTS "help_articles" (
  "id" serial PRIMARY KEY,
  "slug" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "category" text NOT NULL DEFAULT 'General',
  "published" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
