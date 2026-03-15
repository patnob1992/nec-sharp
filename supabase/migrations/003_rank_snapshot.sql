-- Rank snapshot — authoritative rank storage
-- current_rank: system-calculated rank (never downgrades)
-- highest_rank_achieved: permanent best
-- rank_updated_at: last rank change

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS current_rank text DEFAULT 'Novice';
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS highest_rank_achieved text DEFAULT 'Novice';
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS rank_updated_at timestamptz DEFAULT NULL;
