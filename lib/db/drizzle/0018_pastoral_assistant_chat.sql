-- Older, unexported starter tables had no owner column. Preserve them for
-- manual recovery rather than exposing their ownerless content to any user.
DO $$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'conversations'
         AND column_name = 'user_id'
     )
     AND to_regclass('public.conversations_legacy_unowned') IS NULL THEN
    ALTER TABLE public.conversations RENAME TO conversations_legacy_unowned;
    ALTER SEQUENCE IF EXISTS public.conversations_id_seq
      RENAME TO conversations_legacy_unowned_id_seq;
  END IF;

  IF to_regclass('public.conversations_legacy_unowned') IS NOT NULL
     AND to_regclass('public.messages') IS NOT NULL
     AND to_regclass('public.messages_legacy_unowned') IS NULL THEN
    ALTER TABLE public.messages RENAME TO messages_legacy_unowned;
    ALTER SEQUENCE IF EXISTS public.messages_id_seq
      RENAME TO messages_legacy_unowned_id_seq;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.conversations (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_user_id_idx
  ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
  ON public.conversations(updated_at);

CREATE TABLE IF NOT EXISTS public.messages (
  id serial PRIMARY KEY,
  conversation_id integer NOT NULL
    REFERENCES public.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_created_at_idx
  ON public.messages(conversation_id, created_at);