-- ============================================================================
-- Migration 047: Add user-flagging columns to mentor_knowledge_gaps
-- ============================================================================
-- Enables artists to flag wrong Sunny answers via thumbs-down button or
-- text corrections ("that's wrong", "no it's actually...").
-- New columns store the source type, flagged message, and correction notes.
-- ============================================================================

-- Source type: 'auto_detected' (existing), 'user_thumbs_down', 'user_text_correction'
ALTER TABLE mentor_knowledge_gaps ADD COLUMN IF NOT EXISTS source text DEFAULT 'auto_detected';

-- The specific Sunny message that was flagged as wrong
ALTER TABLE mentor_knowledge_gaps ADD COLUMN IF NOT EXISTS flagged_message text;

-- The artist's optional correction note (from thumbs-down modal)
ALTER TABLE mentor_knowledge_gaps ADD COLUMN IF NOT EXISTS user_correction_note text;

-- The user message that preceded the flagged response (conversation context)
ALTER TABLE mentor_knowledge_gaps ADD COLUMN IF NOT EXISTS conversation_context text;

-- Index on source for filtering in admin Learning tab
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_source
  ON mentor_knowledge_gaps(source);

-- RLS: Allow authenticated users to insert (artists flagging wrong answers)
-- Service role inserts bypass RLS, but client-side flag endpoint uses server client
-- so this policy is a safety net for future direct-insert patterns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mentor_knowledge_gaps' AND policyname = 'Users can flag knowledge gaps'
  ) THEN
    CREATE POLICY "Users can flag knowledge gaps" ON mentor_knowledge_gaps
    FOR INSERT TO authenticated
    WITH CHECK (true);
  END IF;
END $$;
