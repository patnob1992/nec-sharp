-- Store last week's summary for the weekly reset modal.
-- Populated when user completes first session of new week.

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_week_sessions int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_week_correct int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_week_answered int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_week_articles_improved int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_week_ppi int DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_week_rank_position int DEFAULT NULL;
