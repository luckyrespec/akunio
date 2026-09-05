ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS model_preset text NOT NULL DEFAULT 'fast';
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();
-- Gemini Interactions memory: chaining previous_interaction_id per thread (store:true).
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS gemini_interaction_id text;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reasoning text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments jsonb;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tool_invocations jsonb;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings jsonb;
