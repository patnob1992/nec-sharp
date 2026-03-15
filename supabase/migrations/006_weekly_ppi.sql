-- Weekly Performance Index (PPI) for competitive weekly cycle
-- PPI = (weeklyAccuracy × 50) + (weeklySessions × 10) + (weeklyArticlesImproved × 15)
-- Reset every Sunday 00:00 UTC. Sortable for leaderboard.

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS ppi int DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_stats_ppi ON user_stats(ppi DESC NULLS LAST);
