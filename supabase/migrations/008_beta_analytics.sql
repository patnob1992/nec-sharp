-- Beta analytics: usage events and feedback
-- For measuring retention, completion rate, engagement drop-off

-- Usage events (daily_open, session_started, session_completed, questions_exit)
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('daily_open', 'session_started', 'session_completed', 'questions_exit')),
  questions_completed int DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own usage events" ON usage_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own usage events" ON usage_events
  FOR SELECT USING (auth.uid() = user_id);

-- Beta feedback
CREATE TABLE IF NOT EXISTS beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_user ON beta_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created ON beta_feedback(created_at DESC);

ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback" ON beta_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own feedback" ON beta_feedback
  FOR SELECT USING (auth.uid() = user_id);
