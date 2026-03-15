-- Article mastery: lifetime per-article correct/answered for rank computation
-- article = chapter key only (e.g. "110")

CREATE TABLE IF NOT EXISTS article_mastery (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article text NOT NULL,
  total_answered int NOT NULL DEFAULT 0,
  total_correct int NOT NULL DEFAULT 0,
  mastery_pct int NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, article)
);

CREATE INDEX IF NOT EXISTS idx_article_mastery_user ON article_mastery(user_id);

ALTER TABLE article_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own article_mastery" ON article_mastery
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own article_mastery" ON article_mastery
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own article_mastery" ON article_mastery
  FOR SELECT USING (auth.uid() = user_id);
