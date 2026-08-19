CREATE TABLE IF NOT EXISTS public.bot_knowledge (
  id bigserial PRIMARY KEY,
  question text NOT NULL UNIQUE,
  answer text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_knowledge_updated_at
  ON public.bot_knowledge (updated_at DESC);
