-- Beta usage tracking for closed beta
-- Events: app_open, session_start, session_complete

CREATE TABLE IF NOT EXISTS beta_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('app_open', 'session_start', 'session_complete')),
  metadata jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_usage_user_created ON beta_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_usage_type ON beta_usage(event_type);
CREATE INDEX IF NOT EXISTS idx_beta_usage_created ON beta_usage(created_at DESC);

ALTER TABLE beta_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own beta_usage" ON beta_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own beta_usage" ON beta_usage
  FOR SELECT USING (auth.uid() = user_id);
