-- Leaderboard Performance Score
-- Adds weekly performance tracking to user_stats.
-- Performance Score = (weeklyAccuracy × 40) + (streakLength × 3) + (articlesImprovedThisWeek × 10)
-- Reset weekly. Lifetime XP unchanged.
-- Requires: user_stats has user_id as primary key or UNIQUE for upsert.

-- Add columns to user_stats
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS week_key text DEFAULT NULL;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS weekly_sessions_completed int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS weekly_correct int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS weekly_answered int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS weekly_articles_improved int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS performance_score int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS rank_label text DEFAULT 'Novice';

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_user_stats_performance_score ON user_stats(performance_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_user_stats_rank_label ON user_stats(rank_label);
CREATE INDEX IF NOT EXISTS idx_user_stats_week_key ON user_stats(week_key);
